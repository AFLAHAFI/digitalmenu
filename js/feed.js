// Live order feed for staff screens.
// Loads open orders once, then applies each realtime change directly
// (no full reload per order = fast in a busy lunch hour). A full re-sync
// still runs every 60 s, after reconnecting, and when the screen wakes up.
(function () {
  DM.orderFeed = function (rid, opts) {
    // opts: { items:bool, sessions:bool, onOrders(list), onItems(), onSessions(), extraRefresh() }
    const map = new Map();
    let ready = false, busy = false, again = false, itemTimer = null, sessTimer = null;

    const emit = () => {
      if (!ready) return;
      const list = [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      opts.onOrders(list);
    };

    async function resync() {
      if (busy) { again = true; return; }
      busy = true;
      try {
        const [rows] = await Promise.all([
          DMStore.listOpenOrders(rid),
          opts.items && opts.onItems ? opts.onItems() : null,
          opts.sessions && opts.onSessions ? opts.onSessions() : null,
          opts.extraRefresh ? opts.extraRefresh() : null,
        ]);
        map.clear();
        rows.forEach((o) => map.set(o.id, o));
        ready = true;
        DM.setConn(true);
        emit();
      } catch (e) {
        console.warn('resync', e);
        if (DM.isNetErr(e)) DM.setConn(false);
        else if (/not allowed|jwt|permission/i.test(String(e && e.message))) checkStillAllowed();
      }
      busy = false;
      if (again) { again = false; resync(); }
    }

    // a locked/removed account: send back to login
    async function checkStillAllowed() {
      const me = await DMStore.myRole(rid).catch(() => undefined);
      if (me === null) location.reload();
    }

    const debounce = (fnName) => {
      if (fnName === 'items') { clearTimeout(itemTimer); itemTimer = setTimeout(() => opts.onItems && opts.onItems(), 250); }
      if (fnName === 'sessions') { clearTimeout(sessTimer); sessTimer = setTimeout(() => opts.onSessions && opts.onSessions(), 250); }
    };

    function onEvent(table, p) {
      if (table === 'reconnect' || table === 'demo') { resync(); return; }
      if (table === 'items') { debounce('items'); return; }
      if (table === 'sessions') { debounce('sessions'); return; }
      if (table !== 'orders' || !p) return;
      if (p.eventType === 'DELETE') { map.delete(p.old && p.old.id); emit(); return; }
      const o = p.new;
      if (!o || !o.id) { resync(); return; }
      const old = map.get(o.id);
      // ignore an older copy arriving late
      if (old && JSON.stringify(old) === JSON.stringify(o)) return;
      if (DMStore.isOpenOrder(o)) map.set(o.id, o); else map.delete(o.id);
      emit();
      if (opts.extraRefresh && (o.paid_at || o.status === 'cancelled')) opts.extraRefresh();
    }

    DMStore.subscribe(rid, { orders: true, items: !!opts.items, sessions: !!opts.sessions }, onEvent,
      (up) => { if (!up && !navigator.onLine) DM.setConn(false); });
    window.addEventListener('online', resync);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') resync(); });
    setInterval(resync, 60000);
    resync();

    return {
      resync,
      // apply our own change immediately (realtime will confirm it)
      patch(id, fields) { const o = map.get(id); if (!o) return; const n = { ...o, ...fields }; if (DMStore.isOpenOrder(n)) map.set(id, n); else map.delete(id); emit(); },
      get(id) { return map.get(id); },
    };
  };
})();
