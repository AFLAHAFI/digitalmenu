// Data layer. Two back-ends with the same API:
//   live  -> Supabase (database + realtime + staff-admin function)
//   demo  -> this browser's localStorage (works across tabs, no login)
//
// Customers never read the menu directly. They need the token from the QR
// the waiter shows ("table session"); it closes when the bill is paid.
(function () {
  const C = window.DM_CONFIG || {};
  const LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const OPEN_STATUSES = ['new', 'preparing', 'ready'];
  const SESSION_HOURS = 6;
  const isOpenOrder = (o) => o.status !== 'cancelled' && (!o.paid_at || OPEN_STATUSES.includes(o.status));
  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));

  // =====================================================================
  //  LIVE (Supabase)
  // =====================================================================
  function liveStore() {
    const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 20 } },
    });
    const ok = ({ data, error }) => { if (error) throw error; return data; };
    const since36h = () => new Date(Date.now() - 36 * 3600e3).toISOString();

    return {
      mode: 'live', sb, isOpenOrder,
      // ---------- auth ----------
      async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async signOut() { await sb.auth.signOut(); },
      onAuthChange(cb) { sb.auth.onAuthStateChange((ev) => cb(ev)); },
      async myRole(rid) {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return null;
        return ok(await sb.rpc('my_role', { p_rid: rid }));
      },
      // ---------- hotel ----------
      async getRestaurant(slug) { return ok(await sb.from('restaurants').select('*').eq('slug', slug).maybeSingle()); },
      async updateRestaurant(id, patch) { return ok(await sb.from('restaurants').update(patch).eq('id', id).select().single()); },
      // ---------- menu ----------
      async listItems(rid) {
        return ok(await sb.from('items').select('*').eq('restaurant_id', rid).order('category').order('sort').order('name_en'));
      },
      async saveItem(rid, item) {
        const row = { ...item, restaurant_id: rid };
        delete row.created_at; delete row.updated_at;
        if (item.id) return ok(await sb.from('items').update(row).eq('id', item.id).select().single());
        delete row.id;
        return ok(await sb.from('items').insert(row).select().single());
      },
      async deleteItem(id) { ok(await sb.from('items').delete().eq('id', id)); },
      async setStock(id, inStock) { ok(await sb.rpc('set_stock', { p_item: id, p_in_stock: inStock })); },
      async setStockQty(id, qty) { ok(await sb.rpc('set_stock_qty', { p_item: id, p_qty: qty })); },
      async reorderItems(rid, ids) { ok(await sb.rpc('reorder_items', { p_rid: rid, p_ids: ids })); },
      async uploadPhoto(rid, blob) {
        const path = `${rid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
        ok(await sb.storage.from('menu-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '31536000' }));
        return sb.storage.from('menu-photos').getPublicUrl(path).data.publicUrl;
      },
      // ---------- tables / QR ----------
      async openTable(rid, table) { return ok(await sb.rpc('open_table', { p_rid: rid, p_table: table })); },
      async closeTable(rid, table) { ok(await sb.rpc('close_table', { p_rid: rid, p_table: table })); },
      async listOpenSessions(rid) {
        const since = new Date(Date.now() - SESSION_HOURS * 3600e3).toISOString();
        return ok(await sb.from('table_sessions').select('id,table_no,created_at')
          .eq('restaurant_id', rid).eq('status', 'open').gt('last_activity_at', since));
      },
      // ---------- orders ----------
      async waiterOrder({ rid, table, items, note, clientRef, orderType, customerName, customerPhone }) {
        return ok(await sb.rpc('place_waiter_order', { p_rid: rid, p_table: table || 0, p_items: items, p_note: note || null,
          p_client_ref: clientRef || null, p_order_type: orderType || 'dine_in', p_customer_name: customerName || null, p_customer_phone: customerPhone || null }));
      },
      async payBill(rid, orderIds, { discount = 0, discountNote = null, cash = null, upi = null, phone = null } = {}) {
        return ok(await sb.rpc('pay_bill', { p_rid: rid, p_order_ids: orderIds, p_discount: discount, p_discount_note: discountNote,
          p_cash: cash, p_upi: upi, p_customer_phone: phone }));
      },
      async moveTable(rid, from, to) { return ok(await sb.rpc('move_table', { p_rid: rid, p_from: from, p_to: to })); },
      async listBillsSince(rid, iso) {
        return ok(await sb.from('bills').select('*').eq('restaurant_id', rid).gte('created_at', iso).order('created_at', { ascending: false }));
      },
      async listOpenOrders(rid) {
        return ok(await sb.from('orders').select('*').eq('restaurant_id', rid)
          .gte('created_at', since36h()).neq('status', 'cancelled')
          .or('paid_at.is.null,status.in.(new,preparing,ready)').order('created_at'));
      },
      async listPaidSince(rid, iso) {
        return ok(await sb.from('orders').select('id,table_no,total,pay_method,paid_at,bill_id')
          .eq('restaurant_id', rid).gte('paid_at', iso).neq('status', 'cancelled').order('paid_at', { ascending: false }));
      },
      async setOrderStatus(id, status) { return ok(await sb.from('orders').update({ status }).eq('id', id).select().single()); },
      async markTablePaid(rid, table, method) { return ok(await sb.rpc('mark_table_paid', { p_rid: rid, p_table: table, p_method: method })); },
      // ---------- customer (QR token) ----------
      async sessionMenu(token) { return ok(await sb.rpc('session_menu', { p_token: token })); },
      async sessionState(token) { return ok(await sb.rpc('session_state', { p_token: token })); },
      async placeOrder({ token, items, note, clientRef }) {
        return ok(await sb.rpc('place_order', { p_token: token, p_items: items, p_note: note || null, p_client_ref: clientRef || null }));
      },
      // ---------- staff ----------
      async listStaff(rid) { return ok(await sb.rpc('list_staff', { p_rid: rid })); },
      async staffAction(rid, action, payload) {
        const { data, error } = await sb.functions.invoke('staff-admin', { body: { action, restaurant_id: rid, ...payload } });
        if (error) {
          let msg = error.message;
          try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) { /* keep */ }
          throw new Error(msg);
        }
        if (data && data.error) throw new Error(data.error);
        return data;
      },
      // ---------- reports ----------
      async report(rid, from, to) { return ok(await sb.rpc('report', { p_rid: rid, p_from: from, p_to: to })); },
      async reportOrders(rid, from, to) { return ok(await sb.rpc('report_orders', { p_rid: rid, p_from: from, p_to: to })); },
      async audit(rid, limit = 150) {
        return ok(await sb.from('audit_log').select('*').eq('restaurant_id', rid).order('created_at', { ascending: false }).limit(limit));
      },
      // ---------- realtime (staff screens) ----------
      // onEvent(table, payload) for every change; onConn(true|false)
      subscribe(rid, { orders = true, items = false, sessions = false, bills = false } = {}, onEvent, onConn) {
        let ch = sb.channel('dm-' + rid + '-' + Math.random().toString(36).slice(2, 7));
        const f = { schema: 'public', filter: 'restaurant_id=eq.' + rid, event: '*' };
        if (orders) ch = ch.on('postgres_changes', { ...f, table: 'orders' }, (p) => onEvent('orders', p));
        if (items) ch = ch.on('postgres_changes', { ...f, table: 'items' }, (p) => onEvent('items', p));
        if (sessions) ch = ch.on('postgres_changes', { ...f, table: 'table_sessions' }, (p) => onEvent('sessions', p));
        if (bills) ch = ch.on('postgres_changes', { ...f, table: 'bills' }, (p) => onEvent('bills', p));
        let wasDown = false;
        ch.subscribe((status) => {
          const up = status === 'SUBSCRIBED';
          if (onConn) onConn(up);
          if (up && wasDown) onEvent('reconnect', null);   // catch up on anything missed
          if (!up) wasDown = true;
        });
        return () => sb.removeChannel(ch);
      },
    };
  }

  // =====================================================================
  //  DEMO (localStorage) — same rules as the SQL functions in schema.sql
  // =====================================================================
  function demoStore() {
    const KEY = 'dm_demo_v1';
    const listeners = new Set();
    const now = () => new Date().toISOString();
    const seed = () => {
      const rid = 'demo-r1';
      const mk = (name_en, name_ml, category, price, is_veg, sort, extra = {}) =>
        ({ id: uid(), restaurant_id: rid, name_en, name_ml, category, price, is_veg, in_stock: true, photo_url: null,
           photos: [], description: null, is_special: false, variants: [], addons: [], stock_qty: null, sort, created_at: now(), ...extra });
      return {
        restaurant: { id: rid, slug: 'demo-hotel', name: 'Hotel Malabar (Demo)', name_ml: 'ഹോട്ടൽ മലബാർ (ഡെമോ)', tables_count: 8,
          upi_id: '', logo_url: null, banner_url: null, theme_color: '#1f7a4d', category_photos: {}, menu_version: 1,
          gst_rate: 0, gst_inclusive: false, gstin: '', parcel_charge: 0, bill_footer: '' },
        bills: [],
        sessions: [], audit: [],
        staff: [
          { user_id: 'demo-owner', username: null, display_name: 'Owner (demo)', role: 'owner', active: true, email: 'owner@demo', created_at: now() },
          { user_id: 'demo-w1', username: 'ravi', display_name: 'Ravi', role: 'waiter', active: true, created_at: now() },
          { user_id: 'demo-k1', username: 'cook', display_name: 'Cook', role: 'kitchen', active: true, created_at: now() },
        ],
        items: [
          mk('Porotta', 'പൊറോട്ട', 'Breakfast & Snacks', 15, true, 1, { is_special: true, description: 'Soft layered Kerala porotta' }),
          mk('Appam', 'അപ്പം', 'Breakfast & Snacks', 12, true, 2),
          mk('Puttu', 'പുട്ട്', 'Breakfast & Snacks', 25, true, 3),
          mk('Dosa', 'ദോശ', 'Breakfast & Snacks', 20, true, 4),
          mk('Kadala Curry', 'കടല കറി', 'Curries', 40, true, 1),
          mk('Egg Curry', 'മുട്ട കറി', 'Curries', 45, false, 2),
          mk('Chicken Curry', 'ചിക്കൻ കറി', 'Curries', 110, false, 3),
          mk('Beef Fry', 'ബീഫ് ഫ്രൈ', 'Curries', 140, false, 4, { is_special: true, description: 'Slow-roasted with coconut slices' }),
          mk('Kerala Meals', 'ഊണ്', 'Meals', 90, true, 1),
          mk('Chicken Biryani', 'ചിക്കൻ ബിരിയാണി', 'Meals', 160, false, 2, {
            variants: [{ name_en: 'Half', name_ml: 'ഹാഫ്', price: 100 }, { name_en: 'Full', name_ml: 'ഫുൾ', price: 160 }],
            addons: [{ name_en: 'Extra egg', name_ml: 'എക്സ്ട്രാ മുട്ട', price: 15 }, { name_en: 'Raita', name_ml: 'റൈത്ത', price: 10 }] }),
          mk('Fish Fry', 'മീൻ വറുത്തത്', 'Meals', 80, false, 3, { stock_qty: 12 }),
          mk('Tea', 'ചായ', 'Drinks', 12, true, 1),
          mk('Coffee', 'കാപ്പി', 'Drinks', 15, true, 2),
          mk('Lime Juice', 'നാരങ്ങ വെള്ളം', 'Drinks', 20, true, 3),
        ],
        orders: [],
      };
    };
    const load = () => {
      let d = null;
      try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* reset */ }
      if (!d || !d.restaurant) { d = seed(); localStorage.setItem(KEY, JSON.stringify(d)); }
      // upgrade demo data from older versions
      const s = seed();
      d.restaurant = { ...s.restaurant, ...d.restaurant, id: d.restaurant.id };
      d.sessions = (d.sessions || []).map((x) => (x.status === 'open' || x.status === 'closed' ? x : { ...x, status: 'closed' }));
      d.staff = d.staff || s.staff; d.audit = d.audit || []; d.bills = d.bills || [];
      d.items.forEach((i) => {
        i.photos = i.photos || []; i.variants = i.variants || []; i.addons = i.addons || [];
        if (i.is_special === undefined) i.is_special = false; if (i.stock_qty === undefined) i.stock_qty = null;
      });
      d.orders.forEach((o) => { o.order_type = o.order_type || 'dine_in'; });
      d.orders.forEach((o) => { if (!['new', 'preparing', 'ready', 'served', 'cancelled'].includes(o.status)) o.status = 'cancelled'; });
      return d;
    };
    const save = (d) => {
      try { localStorage.setItem(KEY, JSON.stringify(d)); }
      catch (e) { throw new Error('Demo storage full — use fewer/smaller photos'); }
      listeners.forEach((fn) => fn('local'));
    };
    window.addEventListener('storage', (e) => { if (e.key === KEY) listeners.forEach((fn) => fn('storage')); });
    const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
    const delay = (v) => new Promise((res) => setTimeout(() => res(clone(v)), 40));
    const sortItems = (a, b) => a.category.localeCompare(b.category) || a.sort - b.sort || a.name_en.localeCompare(b.name_en);
    const isLive = (s) => s && s.status === 'open' && Date.now() - new Date(s.last_activity_at).getTime() < SESSION_HOURS * 3600e3;
    const closed = () => new Error('SESSION_CLOSED');
    const audit = (d, action, details) => { d.audit.unshift({ id: Date.now() + Math.random(), action, details, actor: 'Owner (demo)', created_at: now() }); d.audit = d.audit.slice(0, 300); };
    const bump = (d) => { d.restaurant.menu_version = (d.restaurant.menu_version || 1) + 1; };

    function makeOrder(d, table, items, note, source, sessionId, clientRef, createdBy, orderType = 'dine_in', custName = null, custPhone = null) {
      const r = d.restaurant;
      if (clientRef) {
        const prev = d.orders.find((o) => o.client_ref === clientRef);
        if (prev) return { id: prev.id, order_no: prev.order_no, total: prev.total, duplicate: true };
      }
      if (orderType === 'parcel') table = 0;
      else if (!table || table < 1 || table > r.tables_count) throw new Error('Invalid table number');
      if (!items || !items.length) throw new Error('Order is empty');
      if (orderType !== 'parcel' && d.orders.filter((o) => o.table_no === table && o.status === 'new').length >= 15) throw new Error('Too many pending orders for this table');
      const snapshot = JSON.stringify(d.items.map((i) => [i.id, i.stock_qty, i.in_stock]));
      try {
        let total = 0; const out = [];
        for (const line of items) {
          const it = d.items.find((x) => x.id === line.id);
          if (!it) throw new Error('Item not found');
          if (!it.in_stock) throw new Error('OUT_OF_STOCK:' + it.name_en);
          if (!(line.qty >= 1 && line.qty <= 50)) throw new Error('Invalid quantity');
          let unit = Number(it.price), v = null; const adds = [];
          if (it.variants.length) {
            if (!(line.variant >= 0 && line.variant < it.variants.length)) throw new Error('CHOOSE_OPTION:' + it.name_en);
            v = it.variants[line.variant]; unit = Number(v.price);
          }
          [...new Set(line.addons || [])].forEach((k) => {
            const a = it.addons[k]; if (!a) throw new Error('Invalid add-on');
            adds.push({ name_en: a.name_en, name_ml: a.name_ml, price: Number(a.price) }); unit += Number(a.price);
          });
          if (it.stock_qty !== null && it.stock_qty !== undefined) {
            if (it.stock_qty < line.qty) throw new Error(`OUT_OF_STOCK:${it.name_en} (only ${it.stock_qty} left)`);
            it.stock_qty -= line.qty; it.in_stock = it.stock_qty > 0;
          }
          const ln = { id: it.id, name_en: it.name_en, name_ml: it.name_ml, price: unit, qty: line.qty, is_veg: it.is_veg };
          if (v) { ln.variant_en = v.name_en; ln.variant_ml = v.name_ml; }
          if (adds.length) ln.addons = adds;
          out.push(ln); total += unit * line.qty;
        }
        if (orderType === 'parcel' && Number(r.parcel_charge) > 0) {
          out.push({ id: 'parcel', name_en: 'Parcel charge', name_ml: 'പാഴ്സൽ ചാർജ്', price: Number(r.parcel_charge), qty: 1, is_veg: true });
          total += Number(r.parcel_charge);
        }
        if (snapshot !== JSON.stringify(d.items.map((i) => [i.id, i.stock_qty, i.in_stock]))) bump(d);
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const no = Math.max(0, ...d.orders.filter((o) => new Date(o.created_at) >= today).map((o) => o.order_no)) + 1;
        const o = { id: uid(), restaurant_id: r.id, order_no: no, table_no: table, items: out, total, note: (note || '').trim().slice(0, 200) || null,
          source, status: 'new', session_id: sessionId || null, client_ref: clientRef || null, created_by: createdBy || null,
          order_type: orderType, customer_name: (custName || '').trim().slice(0, 40) || null,
          customer_phone: String(custPhone || '').replace(/[^0-9+]/g, '').slice(0, 15) || null, bill_id: null,
          created_at: now(), preparing_at: null, ready_at: null, served_at: null, paid_at: null, pay_method: null };
        d.orders.push(o);
        const cut = Date.now() - 45 * 864e5;            // keep 45 days of demo history
        d.orders = d.orders.filter((x) => new Date(x.created_at).getTime() > cut);
        d.bills = d.bills.filter((x) => new Date(x.created_at).getTime() > cut);
        d.sessions = d.sessions.filter((x) => x.status === 'open' || new Date(x.last_activity_at).getTime() > Date.now() - 864e5);
        return { id: o.id, order_no: no, total };
      } catch (e) {
        // undo stock taken by earlier lines (same as a database rollback)
        const snap = JSON.parse(snapshot);
        snap.forEach(([id, q, s2]) => { const it = d.items.find((x) => x.id === id); if (it) { it.stock_qty = q; it.in_stock = s2; } });
        throw e;
      }
    }

    function payBill(d, ids, { discount = 0, discountNote = null, cash = null, upi = null, phone = null } = {}) {
      const r = d.restaurant;
      if (!ids || !ids.length) throw new Error('No orders selected');
      const os = d.orders.filter((o) => ids.includes(o.id) && !o.paid_at && o.status !== 'cancelled');
      if (os.length !== new Set(ids).size) throw new Error('Some orders were already paid or cancelled — please refresh');
      if (new Set(os.map((o) => o.table_no + '|' + o.order_type)).size !== 1) throw new Error('All orders in one bill must be from the same table');
      const r2 = (x) => Math.round(x * 100) / 100;
      const sub = r2(os.reduce((a, o) => a + Number(o.total), 0));
      const disc = r2(Math.max(0, Number(discount) || 0));
      if (disc > sub) throw new Error('Discount is more than the bill');
      const taxable = sub - disc, rate = Number(r.gst_rate) || 0;
      let gst = 0, total = taxable;
      if (rate > 0) {
        if (r.gst_inclusive) gst = r2(taxable - taxable / (1 + rate / 100));
        else { gst = r2(taxable * rate / 100); total = taxable + gst; }
      }
      const rounded = Math.round(total), roundOff = r2(rounded - total);
      let c, u;
      if (cash === null && upi === null) { c = rounded; u = 0; }
      else {
        c = r2(Number(cash) || 0); u = r2(Number(upi) || 0);
        if (c < 0 || u < 0 || Math.abs(c + u - rounded) > 0.01) throw new Error('PAY_MISMATCH:' + rounded);
      }
      const method = c > 0 && u > 0 ? 'mixed' : u > 0 ? 'upi' : 'cash';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const no = Math.max(0, ...d.bills.filter((b) => new Date(b.created_at) >= today).map((b) => b.bill_no)) + 1;
      const b = { id: uid(), restaurant_id: r.id, bill_no: no, table_no: os[0].table_no, order_type: os[0].order_type, subtotal: sub,
        discount: disc, discount_note: (discountNote || '').trim().slice(0, 80) || null, gst_rate: rate, gst_inclusive: !!r.gst_inclusive,
        gst_amount: gst, round_off: roundOff, total: rounded, cash_amount: c, upi_amount: u,
        customer_phone: String(phone || '').replace(/[^0-9+]/g, '').slice(0, 15) || null, created_by: 'demo-owner', created_at: now() };
      d.bills.push(b);
      const t0 = now();
      os.forEach((o) => { o.paid_at = t0; o.pay_method = method; o.bill_id = b.id; });
      if (b.order_type === 'dine_in' && !d.orders.some((o) => o.table_no === b.table_no && o.order_type === 'dine_in' && !o.paid_at && o.status !== 'cancelled')) {
        d.sessions.forEach((s) => { if (s.table_no === b.table_no) s.status = 'closed'; });
      }
      audit(d, 'bill_paid', { bill_no: no, table: b.table_no, amount: rounded, method, orders: os.length, discount: disc });
      return b;
    }

    // same shape as public.report() in schema.sql
    function buildReport(d, from, to) {
      const f = new Date(from).getTime(), tt = new Date(to).getTime();
      const o = d.orders.filter((x) => { const c = new Date(x.created_at).getTime(); return c >= f && c < tt; });
      const ok = o.filter((x) => x.status !== 'cancelled');
      const sum = (a) => a.reduce((s, x) => s + Number(x.total), 0);
      const day = (iso) => { const x = new Date(iso); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
      const group = (arr, key) => arr.reduce((m, x) => { const k = key(x); (m[k] = m[k] || []).push(x); return m; }, {});
      const li = {};
      ok.forEach((x) => x.items.forEach((i) => {
        if (i.id === 'parcel') return;
        const k = i.id + (i.variant_en ? '|' + i.variant_en : '');
        const e = li[k] || (li[k] = { name_en: i.name_en + (i.variant_en ? ` (${i.variant_en})` : ''),
          name_ml: i.name_ml ? i.name_ml + (i.variant_en ? ` (${i.variant_ml || i.variant_en})` : '') : null, qty: 0, amount: 0 });
        e.qty += i.qty; e.amount += i.qty * i.price;
      }));
      const bl = (d.bills || []).filter((b) => { const c = new Date(b.created_at).getTime(); return c >= f && c < tt; });
      const legacy = ok.filter((x) => x.paid_at && !x.bill_id);
      const bs = (k) => bl.reduce((a, b) => a + Number(b[k]), 0);
      const prep = ok.filter((x) => x.ready_at && x.ready_at > x.created_at).map((x) => (new Date(x.ready_at) - new Date(x.created_at)) / 60000);
      const staffName = (id) => { const s = d.staff.find((x) => x.user_id === id); return s ? (s.display_name || s.username) : 'staff'; };
      return {
        sales: sum(ok), paid: sum(ok.filter((x) => x.paid_at)), unpaid: sum(ok.filter((x) => !x.paid_at)),
        cash: bs('cash_amount') + sum(legacy.filter((x) => x.pay_method === 'cash')), upi: bs('upi_amount') + sum(legacy.filter((x) => x.pay_method === 'upi')),
        collected: bs('total') + sum(legacy), discount: bs('discount'), gst: bs('gst_amount'),
        orders: ok.length, parcels: ok.filter((x) => x.order_type === 'parcel').length,
        bills: bl.length + new Set(legacy.map((x) => x.table_no + '|' + x.paid_at)).size,
        items_sold: Object.values(li).reduce((s, x) => s + x.qty, 0),
        cancelled: o.length - ok.length, cancelled_value: sum(o.filter((x) => x.status === 'cancelled')),
        avg_prep_min: prep.length ? Math.round((prep.reduce((a, b) => a + b, 0) / prep.length) * 10) / 10 : null,
        by_source: { customer: ok.filter((x) => x.source === 'customer').length, waiter: ok.filter((x) => x.source === 'waiter').length },
        by_day: Object.entries(group(ok, (x) => day(x.created_at))).sort().map(([k, a]) => ({ day: k, sales: sum(a), orders: a.length })),
        by_hour: Object.entries(group(ok, (x) => new Date(x.created_at).getHours())).map(([k, a]) => ({ hour: +k, sales: sum(a), orders: a.length })).sort((a, b) => a.hour - b.hour),
        top_items: Object.values(li).sort((a, b) => b.qty - a.qty || b.amount - a.amount).slice(0, 15),
        by_waiter: Object.entries(group(ok, (x) => x.created_by || '')).map(([k, a]) => ({ name: k ? staffName(k) : null, is_customer: !k, orders: a.length, sales: sum(a) })).sort((a, b) => b.sales - a.sales),
      };
    }

    return {
      mode: 'demo', isOpenOrder,
      async signIn() {}, async signOut() {}, onAuthChange() {},
      async myRole() { return { role: 'owner', display_name: 'Owner (demo)', username: null }; },
      async getRestaurant(slug) { const d = load(); return delay(slug === d.restaurant.slug || slug === 'demo-hotel' ? d.restaurant : null); },
      async updateRestaurant(id, patch) {
        const d = load(); const brand = ['name', 'name_ml', 'logo_url', 'banner_url', 'theme_color', 'category_photos'];
        if (brand.some((k) => k in patch)) bump(d);
        Object.assign(d.restaurant, patch); save(d); return delay(d.restaurant);
      },
      async listItems() { return delay(load().items.sort(sortItems)); },
      async saveItem(rid, item) {
        const d = load(); bump(d);
        if (item.id) {
          const it = d.items.find((x) => x.id === item.id);
          if (item.price !== undefined && Number(item.price) !== Number(it.price)) audit(d, 'price_changed', { item: it.name_en, from: it.price, to: item.price });
          Object.assign(it, item); save(d); return delay(it);
        }
        const row = { in_stock: true, photo_url: null, photos: [], description: null, is_special: false, sort: 0, category: 'Main', ...item, id: uid(), restaurant_id: rid, created_at: now() };
        d.items.push(row); audit(d, 'item_added', { item: row.name_en, price: row.price }); save(d); return delay(row);
      },
      async deleteItem(id) { const d = load(); const it = d.items.find((x) => x.id === id); d.items = d.items.filter((x) => x.id !== id); bump(d); if (it) audit(d, 'item_deleted', { item: it.name_en }); save(d); },
      async setStock(id, inStock) { const d = load(); d.items.find((x) => x.id === id).in_stock = inStock; bump(d); save(d); },
      async setStockQty(id, qty) {
        if (qty !== null && !(qty >= 0 && qty <= 100000)) throw new Error('Invalid quantity');
        const d = load(); const it = d.items.find((x) => x.id === id); it.stock_qty = qty; if (qty !== null) it.in_stock = qty > 0; bump(d); save(d);
      },
      async reorderItems(rid, ids) { const d = load(); ids.forEach((id, i) => { const it = d.items.find((x) => x.id === id); if (it) it.sort = i + 1; }); bump(d); save(d); },
      async uploadPhoto(rid, blob) {
        return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
      },
      async openTable(rid, table) {
        const d = load();
        if (!(table >= 1 && table <= d.restaurant.tables_count)) throw new Error('Invalid table number');
        d.sessions.forEach((s) => { if (s.table_no === table && s.status === 'open' && !isLive(s)) s.status = 'closed'; });
        let s = d.sessions.find((x) => x.table_no === table && isLive(x));
        if (!s) { s = { id: uid(), table_no: table, status: 'open', created_at: now(), last_activity_at: now() }; d.sessions.push(s); }
        else s.last_activity_at = now();
        save(d); return delay({ token: s.id, table_no: table, created_at: s.created_at });
      },
      async closeTable(rid, table) { const d = load(); d.sessions.forEach((s) => { if (s.table_no === table) s.status = 'closed'; }); save(d); },
      async listOpenSessions() { return delay(load().sessions.filter(isLive).map(({ id, table_no, created_at }) => ({ id, table_no, created_at }))); },
      async waiterOrder({ table, items, note, clientRef, orderType, customerName, customerPhone }) {
        const d = load(); const parcel = orderType === 'parcel';
        const s = parcel ? null : d.sessions.find((x) => x.table_no === table && isLive(x));
        const res = makeOrder(d, table, items, note, 'waiter', s && s.id, clientRef, 'demo-owner', parcel ? 'parcel' : 'dine_in', customerName, customerPhone);
        save(d); return delay(res);
      },
      async payBill(rid, ids, opts) { const d = load(); const b = payBill(d, ids, opts); save(d); return delay(b); },
      async moveTable(rid, from, to) {
        const d = load();
        if (from === to || !(to >= 1 && to <= d.restaurant.tables_count)) throw new Error('Invalid table number');
        let n = 0;
        d.orders.forEach((o) => { if (o.table_no === from && o.order_type === 'dine_in' && !o.paid_at && o.status !== 'cancelled') { o.table_no = to; n++; } });
        const hasTo = d.sessions.some((x) => x.table_no === to && x.status === 'open');
        d.sessions.forEach((x) => { if (x.table_no === from && x.status === 'open') { if (hasTo) x.status = 'closed'; else x.table_no = to; } });
        audit(d, 'table_moved', { from, to, orders: n }); save(d); return delay(n);
      },
      async listBillsSince(rid, iso) { return delay(load().bills.filter((b) => b.created_at >= iso).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
      async listOpenOrders() {
        const cut = Date.now() - 36 * 3600e3;
        return delay(load().orders.filter((o) => isOpenOrder(o) && new Date(o.created_at).getTime() >= cut));
      },
      async listPaidSince(rid, iso) {
        return delay(load().orders.filter((o) => o.status !== 'cancelled' && o.paid_at && o.paid_at >= iso).sort((a, b) => b.paid_at.localeCompare(a.paid_at)));
      },
      async setOrderStatus(id, status) {
        const d = load(); const o = d.orders.find((x) => x.id === id);
        if (o.status === status) return delay(o);
        if (o.status === 'cancelled') throw new Error('Order is cancelled');
        if (status === 'cancelled' && o.paid_at) throw new Error('Order is already paid');
        const n = now();
        if (status === 'preparing') o.preparing_at = o.preparing_at || n;
        if (status === 'ready') o.ready_at = o.ready_at || n;
        if (status === 'served') { o.served_at = o.served_at || n; o.ready_at = o.ready_at || n; }
        if (status === 'cancelled') {
          o.cancelled_at = n; audit(d, 'order_cancelled', { order_no: o.order_no, table: o.table_no, total: o.total });
          o.items.forEach((l) => { const it = d.items.find((x) => x.id === l.id); if (it && it.stock_qty !== null && it.stock_qty !== undefined) { it.stock_qty += l.qty; it.in_stock = true; bump(d); } });
        }
        o.status = status; save(d); return delay(o);
      },
      async markTablePaid(rid, table, method) {
        const d = load();
        const ids = d.orders.filter((o) => o.table_no === table && o.order_type === 'dine_in' && !o.paid_at && o.status !== 'cancelled').map((o) => o.id);
        if (!ids.length) { d.sessions.forEach((s) => { if (s.table_no === table) s.status = 'closed'; }); save(d); return delay(0); }
        const b = payBill(d, ids, {});
        if (method === 'upi') { b.upi_amount = b.total; b.cash_amount = 0; d.orders.forEach((o) => { if (o.bill_id === b.id) o.pay_method = 'upi'; }); }
        save(d); return delay(ids.length);
      },
      async sessionMenu(token) {
        const d = load(); const s = d.sessions.find((x) => x.id === token);
        if (!isLive(s)) throw closed();
        const r = d.restaurant;
        return delay({ restaurant: { name: r.name, name_ml: r.name_ml, slug: r.slug, logo_url: r.logo_url, banner_url: r.banner_url,
          theme_color: r.theme_color, category_photos: r.category_photos }, menu_version: r.menu_version, table_no: s.table_no, items: d.items.sort(sortItems) });
      },
      async sessionState(token) {
        const d = load(); const s = d.sessions.find((x) => x.id === token);
        if (!isLive(s)) return delay({ open: false });
        return delay({ open: true, menu_version: d.restaurant.menu_version, table_no: s.table_no,
          orders: d.orders.filter((o) => o.session_id === s.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map(({ id, order_no, status, total, created_at }) => ({ id, order_no, status, total, created_at })) });
      },
      async placeOrder({ token, items, note, clientRef }) {
        const d = load(); const s = d.sessions.find((x) => x.id === token);
        if (!isLive(s)) throw closed();
        s.last_activity_at = now();
        const res = makeOrder(d, s.table_no, items, note, 'customer', s.id, clientRef, null); save(d); return delay(res);
      },
      async listStaff() { return delay(load().staff.map((s) => ({ ...s, is_me: s.user_id === 'demo-owner' }))); },
      async staffAction(rid, action, p) {
        const d = load();
        const uname = (v) => { const s = String(v || '').trim().toLowerCase(); if (!/^[a-z0-9][a-z0-9_.-]{2,19}$/.test(s)) throw new Error('Username: 3–20 letters/numbers (a-z 0-9 . _ -)'); return s; };
        const taken = (u, except) => d.staff.some((s) => s.username === u && s.user_id !== except);
        if (action === 'create') {
          const username = uname(p.username);
          if (taken(username)) throw new Error('This username is already used');
          if (!p.display_name || !String(p.display_name).trim()) throw new Error('Name must be 1–40 characters');
          if (String(p.password || '').length < 6) throw new Error('Password must be at least 6 characters');
          d.staff.push({ user_id: uid(), username, display_name: String(p.display_name).trim(), role: p.role, active: true, created_at: now() });
          audit(d, 'staff_added', { username, role: p.role });
        } else {
          const s = d.staff.find((x) => x.user_id === p.user_id); if (!s) throw new Error('Staff member not found');
          const self = s.user_id === 'demo-owner';
          if (action === 'delete') { if (self) throw new Error('You cannot remove yourself'); d.staff = d.staff.filter((x) => x !== s); audit(d, 'staff_removed', { who: s.display_name }); }
          else {
            if (p.username !== undefined && s.username && p.username !== s.username) { const u = uname(p.username); if (taken(u, s.user_id)) throw new Error('This username is already used'); s.username = u; }
            if (p.display_name !== undefined) s.display_name = String(p.display_name).trim();
            if (p.role !== undefined && p.role !== s.role) { if (self) throw new Error('You cannot change your own role'); s.role = p.role; }
            if (p.password) { if (String(p.password).length < 6) throw new Error('Password must be at least 6 characters'); }
            if (p.active !== undefined && p.active !== s.active) { if (self) throw new Error('You cannot lock your own login'); s.active = p.active; }
            audit(d, 'staff_updated', { who: s.display_name });
          }
        }
        save(d); return delay({ ok: true });
      },
      async report(rid, from, to) { return delay(buildReport(load(), from, to)); },
      async reportOrders(rid, from, to) {
        const d = load(); const f = new Date(from).getTime(), tt = new Date(to).getTime();
        return delay(d.orders.filter((o) => { const c = new Date(o.created_at).getTime(); return c >= f && c < tt; })
          .sort((a, b) => a.created_at.localeCompare(b.created_at))
          .map((o) => ({ order_no: o.order_no, created_at: o.created_at, table_no: o.table_no, status: o.status, source: o.source,
            staff: o.created_by ? ((d.staff.find((s) => s.user_id === o.created_by) || {}).display_name || null) : null,
            items: o.items.map((i) => `${i.qty} x ${i.name_en}${i.variant_en ? ' (' + i.variant_en + ')' : ''}`).join(', '), total: o.total,
            pay_method: o.pay_method, paid_at: o.paid_at, type: o.order_type, customer: o.customer_name,
            bill_no: o.bill_id ? ((d.bills.find((b) => b.id === o.bill_id) || {}).bill_no || null) : null })));
      },
      async audit() { return delay(load().audit); },
      subscribe(rid, opts, onEvent, onConn) {
        const fn = () => onEvent('demo', null); listeners.add(fn); if (onConn) onConn(true);
        return () => listeners.delete(fn);
      },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      reset() { localStorage.removeItem(KEY); },
      _addSampleHistory() {           // demo only: fill 30 days of fake sales for the reports screen
        const d = load(); const its = d.items;
        for (let day = 30; day >= 1; day--) {
          const n = 15 + Math.floor(Math.random() * 25);
          for (let k = 0; k < n; k++) {
            const t0 = new Date(); t0.setDate(t0.getDate() - day); t0.setHours(7 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60));
            const picks = [its[Math.floor(Math.random() * its.length)], its[Math.floor(Math.random() * its.length)]];
            const items = picks.map((i) => ({ id: i.id, name_en: i.name_en, name_ml: i.name_ml, price: i.price, qty: 1 + Math.floor(Math.random() * 3), is_veg: i.is_veg }));
            const total = items.reduce((s, i) => s + i.price * i.qty, 0);
            const iso = t0.toISOString(), ready = new Date(t0.getTime() + (5 + Math.random() * 15) * 60000).toISOString();
            const cancelled = Math.random() < 0.03;
            const billId = cancelled ? null : uid(), method = Math.random() < 0.55 ? 'cash' : 'upi';
            if (billId) d.bills.push({ id: billId, restaurant_id: d.restaurant.id, bill_no: k + 1, table_no: 1 + (k % d.restaurant.tables_count), order_type: 'dine_in',
              subtotal: total, discount: 0, discount_note: null, gst_rate: 0, gst_inclusive: false, gst_amount: 0, round_off: 0, total,
              cash_amount: method === 'cash' ? total : 0, upi_amount: method === 'upi' ? total : 0, customer_phone: null, created_by: 'demo-owner', created_at: ready });
            d.orders.push({ id: uid(), restaurant_id: d.restaurant.id, order_no: k + 1, order_type: 'dine_in', bill_id: billId, table_no: 1 + (k % d.restaurant.tables_count), items, total, note: null,
              source: Math.random() < 0.4 ? 'customer' : 'waiter', status: cancelled ? 'cancelled' : 'served', session_id: null, client_ref: null,
              created_by: Math.random() < 0.4 ? null : (Math.random() < 0.5 ? 'demo-w1' : 'demo-owner'),
              created_at: iso, ready_at: ready, served_at: ready, paid_at: cancelled ? null : ready, pay_method: cancelled ? null : method });
          }
        }
        save(d);
      },
    };
  }

  window.DMStore = LIVE ? liveStore() : demoStore();
})();
