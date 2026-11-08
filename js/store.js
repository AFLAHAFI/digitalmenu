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
      async waiterOrder({ rid, table, items, note, clientRef }) {
        return ok(await sb.rpc('place_waiter_order', { p_rid: rid, p_table: table, p_items: items, p_note: note || null, p_client_ref: clientRef || null }));
      },
      async listOpenOrders(rid) {
        return ok(await sb.from('orders').select('*').eq('restaurant_id', rid)
          .gte('created_at', since36h()).neq('status', 'cancelled')
          .or('paid_at.is.null,status.in.(new,preparing,ready)').order('created_at'));
      },
      async listPaidSince(rid, iso) {
        return ok(await sb.from('orders').select('id,table_no,total,pay_method,paid_at')
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
      subscribe(rid, { orders = true, items = false, sessions = false } = {}, onEvent, onConn) {
        let ch = sb.channel('dm-' + rid + '-' + Math.random().toString(36).slice(2, 7));
        const f = { schema: 'public', filter: 'restaurant_id=eq.' + rid, event: '*' };
        if (orders) ch = ch.on('postgres_changes', { ...f, table: 'orders' }, (p) => onEvent('orders', p));
        if (items) ch = ch.on('postgres_changes', { ...f, table: 'items' }, (p) => onEvent('items', p));
        if (sessions) ch = ch.on('postgres_changes', { ...f, table: 'table_sessions' }, (p) => onEvent('sessions', p));
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
           photos: [], description: null, is_special: false, sort, created_at: now(), ...extra });
      return {
        restaurant: { id: rid, slug: 'demo-hotel', name: 'Hotel Malabar (Demo)', name_ml: 'ഹോട്ടൽ മലബാർ (ഡെമോ)', tables_count: 8,
          upi_id: '', logo_url: null, banner_url: null, theme_color: '#1f7a4d', category_photos: {}, menu_version: 1 },
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
          mk('Chicken Biryani', 'ചിക്കൻ ബിരിയാണി', 'Meals', 160, false, 2),
          mk('Fish Fry', 'മീൻ വറുത്തത്', 'Meals', 80, false, 3),
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
      d.staff = d.staff || s.staff; d.audit = d.audit || [];
      d.items.forEach((i) => { i.photos = i.photos || []; if (i.is_special === undefined) i.is_special = false; });
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

    function makeOrder(d, table, items, note, source, sessionId, clientRef, createdBy) {
      const r = d.restaurant;
      if (clientRef) {
        const prev = d.orders.find((o) => o.client_ref === clientRef);
        if (prev) return { id: prev.id, order_no: prev.order_no, total: prev.total, duplicate: true };
      }
      if (!table || table < 1 || table > r.tables_count) throw new Error('Invalid table number');
      if (!items || !items.length) throw new Error('Order is empty');
      if (d.orders.filter((o) => o.table_no === table && o.status === 'new').length >= 15) throw new Error('Too many pending orders for this table');
      let total = 0; const out = [];
      for (const line of items) {
        const it = d.items.find((x) => x.id === line.id);
        if (!it) throw new Error('Item not found');
        if (!it.in_stock) throw new Error('OUT_OF_STOCK:' + it.name_en);
        if (!(line.qty >= 1 && line.qty <= 50)) throw new Error('Invalid quantity');
        out.push({ id: it.id, name_en: it.name_en, name_ml: it.name_ml, price: it.price, qty: line.qty, is_veg: it.is_veg });
        total += it.price * line.qty;
      }
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const no = Math.max(0, ...d.orders.filter((o) => new Date(o.created_at) >= today).map((o) => o.order_no)) + 1;
      const o = { id: uid(), restaurant_id: r.id, order_no: no, table_no: table, items: out, total, note: (note || '').trim().slice(0, 200) || null,
        source, status: 'new', session_id: sessionId || null, client_ref: clientRef || null, created_by: createdBy || null,
        created_at: now(), preparing_at: null, ready_at: null, served_at: null, paid_at: null, pay_method: null };
      d.orders.push(o);
      const cut = Date.now() - 45 * 864e5;            // keep 45 days of demo history
      d.orders = d.orders.filter((x) => new Date(x.created_at).getTime() > cut);
      d.sessions = d.sessions.filter((x) => x.status === 'open' || new Date(x.last_activity_at).getTime() > Date.now() - 864e5);
      return { id: o.id, order_no: no, total };
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
        const e = li[i.id] || (li[i.id] = { name_en: i.name_en, name_ml: i.name_ml, qty: 0, amount: 0 });
        e.qty += i.qty; e.amount += i.qty * i.price;
      }));
      const prep = ok.filter((x) => x.ready_at && x.ready_at > x.created_at).map((x) => (new Date(x.ready_at) - new Date(x.created_at)) / 60000);
      const staffName = (id) => { const s = d.staff.find((x) => x.user_id === id); return s ? (s.display_name || s.username) : 'staff'; };
      return {
        sales: sum(ok), paid: sum(ok.filter((x) => x.paid_at)), unpaid: sum(ok.filter((x) => !x.paid_at)),
        cash: sum(ok.filter((x) => x.pay_method === 'cash')), upi: sum(ok.filter((x) => x.pay_method === 'upi')),
        orders: ok.length, bills: new Set(ok.filter((x) => x.paid_at).map((x) => x.table_no + '|' + x.paid_at)).size,
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
      async waiterOrder({ table, items, note, clientRef }) {
        const d = load(); const s = d.sessions.find((x) => x.table_no === table && isLive(x));
        const res = makeOrder(d, table, items, note, 'waiter', s && s.id, clientRef, 'demo-owner'); save(d); return delay(res);
      },
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
        if (status === 'cancelled') { o.cancelled_at = n; audit(d, 'order_cancelled', { order_no: o.order_no, table: o.table_no, total: o.total }); }
        o.status = status; save(d); return delay(o);
      },
      async markTablePaid(rid, table, method) {
        const d = load(); const n = now(); let c = 0, amt = 0;
        d.orders.forEach((o) => { if (o.table_no === table && !o.paid_at && o.status !== 'cancelled') { o.paid_at = n; o.pay_method = method; c++; amt += Number(o.total); } });
        d.sessions.forEach((s) => { if (s.table_no === table) s.status = 'closed'; });
        if (c) audit(d, 'bill_paid', { table, amount: amt, method, orders: c });
        save(d); return delay(c);
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
            items: o.items.map((i) => `${i.qty} x ${i.name_en}`).join(', '), total: o.total, pay_method: o.pay_method, paid_at: o.paid_at })));
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
            d.orders.push({ id: uid(), restaurant_id: d.restaurant.id, order_no: k + 1, table_no: 1 + (k % d.restaurant.tables_count), items, total, note: null,
              source: Math.random() < 0.4 ? 'customer' : 'waiter', status: cancelled ? 'cancelled' : 'served', session_id: null, client_ref: null,
              created_by: Math.random() < 0.4 ? null : (Math.random() < 0.5 ? 'demo-w1' : 'demo-owner'),
              created_at: iso, ready_at: ready, served_at: ready, paid_at: cancelled ? null : ready, pay_method: cancelled ? null : (Math.random() < 0.55 ? 'cash' : 'upi') });
          }
        }
        save(d);
      },
    };
  }

  window.DMStore = LIVE ? liveStore() : demoStore();
})();
