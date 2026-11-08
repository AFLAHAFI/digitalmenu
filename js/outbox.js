// Offline-safe order sending.
// Every order gets a client_ref (uuid). If the network drops, the order is
// kept on the phone and re-sent automatically; the database ignores a
// second copy with the same client_ref, so nothing is ever ordered twice.
(function () {
  DM.Outbox = function (key, sendFn, hooks = {}) {
    // sendFn(job) -> Promise(result); hooks: onSent(job, result), onFailed(job, err), onChange(count)
    const K = 'dm_outbox_' + key;
    const read = () => { try { return JSON.parse(localStorage.getItem(K)) || []; } catch (e) { return []; } };
    const write = (list) => { try { localStorage.setItem(K, JSON.stringify(list)); } catch (e) { /* full */ } if (hooks.onChange) hooks.onChange(list.length); };
    let flushing = false;

    async function flush() {
      if (flushing || !navigator.onLine) return;
      flushing = true;
      try {
        for (const job of read()) {
          try {
            const res = await sendFn(job);
            write(read().filter((j) => j.clientRef !== job.clientRef));
            if (hooks.onSent) hooks.onSent(job, res);
          } catch (e) {
            if (DM.isNetErr(e)) break;                 // still offline: try later
            write(read().filter((j) => j.clientRef !== job.clientRef));   // real error: drop + tell
            if (hooks.onFailed) hooks.onFailed(job, e);
          }
        }
      } finally { flushing = false; }
    }

    // send now; if offline keep it and resolve { queued: true }
    async function send(payload) {
      const job = { ...payload, clientRef: payload.clientRef || DM.uuid(), at: new Date().toISOString() };
      try {
        return await sendFn(job);
      } catch (e) {
        if (!DM.isNetErr(e)) throw e;
        write([...read(), job]);
        return { queued: true };
      }
    }

    window.addEventListener('online', () => setTimeout(flush, 800));
    setInterval(flush, 15000);
    setTimeout(flush, 1500);
    if (hooks.onChange) hooks.onChange(read().length);
    return { send, flush, count: () => read().length };
  };
})();
