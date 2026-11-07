// Data layer. Two back-ends with the same API:
//   live  -> Supabase (database + realtime)   when config has URL + key
//   demo  -> this browser's localStorage      otherwise (works across tabs)
//
// Customers never read the menu directly. They need the token from the QR
// the waiter shows ("table session"); it closes when the bill is paid.
(function () {
  const C = window.DM_CONFIG || {};
  const LIVE = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
  const OPEN_STATUSES = ['new', 'preparing', 'ready'];
  const SESSION_HOURS = 6;
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
      realtime: { params: { eventsPerSecond: 10 } },
    });
    const ok = ({ data, error }) => { if (error) throw error; return data; };

    return {
      mode: 'live', sb,
      // ---- staff ----
      async getRestaurant(slug) {
        return ok(await sb.from('restaurants').select('*').eq('slug', slug).maybeSingle());
      },
      async updateRestaurant(id, patch) {
        return ok(await sb.from('restaurants').update(patch).eq('id', id).select().single());
      },
      async listItems(rid) {
        return ok(await sb.from('items').select('*').eq('restaurant_id', rid)
          .order('category').order('sort').order('name_en'));
      },
      async saveItem(rid, item) {
        const row = { ...item, restaurant_id: rid };
        if (item.id) return ok(await sb.from('items').update(row).eq('id', item.id).select().single());
        delete row.id;
        return ok(await sb.from('items').insert(row).select().single());
      },
      async deleteItem(id) { ok(await sb.from('items').delete().eq('id', id)); },
      async uploadPhoto(rid, blob) {
        const path = `${rid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
        ok(await sb.storage.from('menu-photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false }));
        return sb.storage.from('menu-photos').getPublicUrl(path).data.publicUrl;
      },
      // waiter taps a table -> { token, table_no } (same token for the whole table)
      async openTable(rid, table) { return ok(await sb.rpc('open_table', { p_rid: rid, p_table: table })); },
      async closeTable(rid, table) { ok(await sb.rpc('close_table', { p_rid: rid, p_table: table })); },
      async listOpenSessions(rid) {
        const since = new Date(Date.now() - SESSION_HOURS * 3600e3).toISOString();
        return ok(await sb.from('table_sessions').select('id,table_no,created_at')
          .eq('restaurant_id', rid).eq('status', 'open').gt('last_activity_at', since));
      },
      async waiterOrder({ rid, table, items, note }) {
        return ok(await sb.rpc('place_waiter_order', { p_rid: rid, p_table: table, p_items: items, p_note: note || null }));
      },
      // Everything not yet finished: still cooking OR not yet paid (last 36 h)
      async listOpenOrders(rid) {
        const since = new Date(Date.now() - 36 * 3600e3).toISOString();
        return ok(await sb.from('orders').select('*').eq('restaurant_id', rid)
          .gte('created_at', since).neq('status', 'cancelled')
          .or('paid_at.is.null,status.in.(new,preparing,ready)')
          .order('created_at'));
      },
      async listPaidSince(rid, iso) {
        return ok(await sb.from('orders').select('*').eq('restaurant_id', rid)
          .gte('paid_at', iso).neq('status', 'cancelled').order('paid_at', { ascending: false }));
      },
      async updateOrder(id, patch) {
        return ok(await sb.from('orders').update(patch).eq('id', id).select().single());
      },
      // also closes the table session -> customers' menu closes
      async markTablePaid(rid, table, method) {
        return ok(await sb.rpc('mark_table_paid', { p_rid: rid, p_table: table, p_method: method }));
      },
      // ---- customer (token from the waiter's QR) ----
      async sessionMenu(token) { return ok(await sb.rpc('session_menu', { p_token: token })); },
      async placeOrder({ token, items, note }) {
        return ok(await sb.rpc('place_order', { p_token: token, p_items: items, p_note: note || null }));
      },
      async sessionOrders(token) { return ok(await sb.rpc('session_orders', { p_token: token })); },
      // ---- realtime (staff screens) ----
      subscribe(rid, { orders = true, items = true, sessions = false } = {}, onChange, onConn) {
        let ch = sb.channel('dm-' + rid + '-' + Math.random().toString(36).slice(2, 6));
        const f = { schema: 'public', filter: 'restaurant_id=eq.' + rid, event: '*' };
        if (orders) ch = ch.on('postgres_changes', { ...f, table: 'orders' }, () => onChange('orders'));
        if (items) ch = ch.on('postgres_changes', { ...f, table: 'items' }, () => onChange('items'));
        if (sessions) ch = ch.on('postgres_changes', { ...f, table: 'table_sessions' }, () => onChange('sessions'));
        let wasDown = false;
        ch.subscribe((status) => {
          const up = status === 'SUBSCRIBED';
          if (onConn) onConn(up);
          if (up && wasDown) onChange('reconnect'); // catch up on anything missed
          if (!up) wasDown = true;
        });
        return () => sb.removeChannel(ch);
      },
      async signIn(email, password) { ok(await sb.auth.signInWithPassword({ email, password })); },
      async signOut() { await sb.auth.signOut(); },
      async isStaff(rid) {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return false;
        const rows = ok(await sb.from('staff').select('role').eq('restaurant_id', rid).eq('user_id', session.user.id));
        return rows.length > 0;
      },
    };
  }

  // =====================================================================
  //  DEMO (localStorage) — same rules as the SQL functions in schema.sql
  // =====================================================================
  function demoStore() {
    const KEY = 'dm_demo_v1';
    const listeners = new Set();
    const seed = () => {
      const rid = 'demo-r1';
      const mk = (name_en, name_ml, category, price, is_veg, sort) =>
        ({ id: uid(), restaurant_id: rid, name_en, name_ml, category, price, is_veg, in_stock: true, photo_url: null, sort, created_at: new Date().toISOString() });
      return {
        restaurant: { id: rid, slug: 'demo-hotel', name: 'Hotel Malabar (Demo)', name_ml: 'ഹോട്ടൽ മലബാർ (ഡെമോ)', tables_count: 8, upi_id: '' },
        sessions: [],
        items: [
          mk('Porotta', 'പൊറോട്ട', 'Breakfast & Snacks', 15, true, 1),
          mk('Appam', 'അപ്പം', 'Breakfast & Snacks', 12, true, 2),
          mk('Puttu', 'പുട്ട്', 'Breakfast & Snacks', 25, true, 3),
          mk('Dosa', 'ദോശ', 'Breakfast & Snacks', 20, true, 4),
          mk('Kadala Curry', 'കടല കറി', 'Curries', 40, true, 1),
          mk('Egg Curry', 'മുട്ട കറി', 'Curries', 45, false, 2),
          mk('Chicken Curry', 'ചിക്കൻ കറി', 'Curries', 110, false, 3),
          mk('Beef Fry', 'ബീഫ് ഫ്രൈ', 'Curries', 140, false, 4),
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
      // upgrade demo data saved by older versions
      d.sessions = (d.sessions || []).map((s) => (s.status === 'open' || s.status === 'closed' ? s : { ...s, status: 'closed' }));
      d.orders.forEach((o) => { if (o.status === 'pending') o.status = 'cancelled'; });
      return d;
    };
    const save = (d) => {
      try { localStorage.setItem(KEY, JSON.stringify(d)); }
      catch (e) { throw new Error('Demo storage full — use smaller photos'); }
      listeners.forEach((fn) => fn('local'));
    };
    window.addEventListener('storage', (e) => { if (e.key === KEY) listeners.forEach((fn) => fn('storage')); });
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const delay = (v) => new Promise((res) => setTimeout(() => res(v === undefined ? v : clone(v)), 60));
    const sortItems = (a, b) => a.category.localeCompare(b.category) || a.sort - b.sort || a.name_en.localeCompare(b.name_en);
    const isLive = (s) => s && s.status === 'open' && Date.now() - new Date(s.last_activity_at).getTime() < SESSION_HOURS * 3600e3;
    const closed = () => new Error('SESSION_CLOSED');

    function makeOrder(d, table, items, note, source, sessionId) {
      const r = d.restaurant;
      if (!table || table < 1 || table > r.tables_count) throw new Error('Invalid table number');
      if (!items || !items.length) throw new Error('Order is empty');
      if (d.orders.filter((o) => o.table_no === table && o.status === 'new').length >= 10) throw new Error('Too many pending orders for this table');
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
        source, status: 'new', session_id: sessionId || null, created_at: new Date().toISOString(), ready_at: null, paid_at: null, pay_method: null };
      d.orders.push(o);
      // keep demo storage small
      const cut = Date.now() - 3 * 864e5;
      d.orders = d.orders.filter((x) => !x.paid_at || new Date(x.paid_at).getTime() > cut);
      d.sessions = d.sessions.filter((x) => x.status === 'open' || new Date(x.last_activity_at).getTime() > cut);
      return { id: o.id, order_no: no, total };
    }

    return {
      mode: 'demo',
      async getRestaurant(slug) { const d = load(); return delay(slug === d.restaurant.slug || slug === 'demo-hotel' ? d.restaurant : null); },
      async updateRestaurant(id, patch) { const d = load(); Object.assign(d.restaurant, patch); save(d); return delay(d.restaurant); },
      async listItems() { return delay(load().items.sort(sortItems)); },
      async saveItem(rid, item) {
        const d = load();
        if (item.id) { const i = d.items.findIndex((x) => x.id === item.id); Object.assign(d.items[i], item); save(d); return delay(d.items[i]); }
        const row = { in_stock: true, photo_url: null, sort: 0, category: 'Main', ...item, id: uid(), restaurant_id: rid, created_at: new Date().toISOString() };
        d.items.push(row); save(d); return delay(row);
      },
      async deleteItem(id) { const d = load(); d.items = d.items.filter((x) => x.id !== id); save(d); },
      async uploadPhoto(rid, blob) {
        return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
      },
      async openTable(rid, table) {
        const d = load();
        if (!(table >= 1 && table <= d.restaurant.tables_count)) throw new Error('Invalid table number');
        d.sessions.forEach((s) => { if (s.table_no === table && s.status === 'open' && !isLive(s)) s.status = 'closed'; });
        let s = d.sessions.find((x) => x.table_no === table && isLive(x));
        const now = new Date().toISOString();
        if (!s) { s = { id: uid(), table_no: table, status: 'open', created_at: now, last_activity_at: now }; d.sessions.push(s); }
        else s.last_activity_at = now;
        save(d); return delay({ token: s.id, table_no: table, created_at: s.created_at });
      },
      async closeTable(rid, table) {
        const d = load(); d.sessions.forEach((s) => { if (s.table_no === table) s.status = 'closed'; }); save(d);
      },
      async listOpenSessions() { return delay(load().sessions.filter(isLive).map(({ id, table_no, created_at }) => ({ id, table_no, created_at }))); },
      async waiterOrder({ table, items, note }) {
        const d = load(); const s = d.sessions.find((x) => x.table_no === table && isLive(x));
        const res = makeOrder(d, table, items, note, 'waiter', s && s.id); save(d); return delay(res);
      },
      async listOpenOrders() { return delay(load().orders.filter((o) => o.status !== 'cancelled' && (!o.paid_at || OPEN_STATUSES.includes(o.status)))); },
      async listPaidSince(rid, iso) {
        return delay(load().orders.filter((o) => o.status !== 'cancelled' && o.paid_at && o.paid_at >= iso).sort((a, b) => b.paid_at.localeCompare(a.paid_at)));
      },
      async updateOrder(id, patch) { const d = load(); const o = d.orders.find((x) => x.id === id); Object.assign(o, patch); save(d); return delay(o); },
      async markTablePaid(rid, table, method) {
        const d = load(); const now = new Date().toISOString(); let n = 0;
        d.orders.forEach((o) => { if (o.table_no === table && !o.paid_at && o.status !== 'cancelled') { o.paid_at = now; o.pay_method = method; n++; } });
        d.sessions.forEach((s) => { if (s.table_no === table) s.status = 'closed'; });
        save(d); return delay(n);
      },
      async sessionMenu(token) {
        const d = load(); const s = d.sessions.find((x) => x.id === token);
        if (!isLive(s)) throw closed();
        const r = d.restaurant;
        return delay({ restaurant: { name: r.name, name_ml: r.name_ml, slug: r.slug }, table_no: s.table_no, items: d.items.sort(sortItems) });
      },
      async placeOrder({ token, items, note }) {
        const d = load(); const s = d.sessions.find((x) => x.id === token);
        if (!isLive(s)) throw closed();
        s.last_activity_at = new Date().toISOString();
        const res = makeOrder(d, s.table_no, items, note, 'customer', s.id); save(d); return delay(res);
      },
      async sessionOrders(token) {
        const d = load(); const s = d.sessions.find((x) => x.id === token);
        if (!isLive(s)) throw closed();
        return delay(d.orders.filter((o) => o.session_id === s.id).sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(({ id, order_no, status, total, created_at }) => ({ id, order_no, status, total, created_at })));
      },
      subscribe(rid, opts, onChange, onConn) {
        const fn = () => onChange('demo'); listeners.add(fn); if (onConn) onConn(true);
        return () => listeners.delete(fn);
      },
      onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      async signIn() {}, async signOut() {}, async isStaff() { return true; },
      reset() { localStorage.removeItem(KEY); },
    };
  }

  window.DMStore = LIVE ? liveStore() : demoStore();
})();
