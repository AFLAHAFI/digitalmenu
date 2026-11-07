// Shared helpers: language, money, sound, screen-awake, offline banner, login.
(function () {
  const C = window.DM_CONFIG || {};

  // ---------------- Language ----------------
  const STR = {
    en: {
      app: 'Digital Menu', table: 'Table', all: 'All', search: 'Search dishes…',
      veg: 'Veg', nonveg: 'Non-veg', add: 'Add', out: 'Out of stock',
      items: 'items', item: 'item', viewOrder: 'View order', yourOrder: 'Your order',
      note: 'Note for kitchen (e.g. less spicy)', send: 'Send order', sending: 'Sending…',
      total: 'Total', sent: 'Order sent!', sentSub: 'The kitchen has your order.',
      orderMore: 'Order more', myOrders: 'Your orders on this visit', myShort: 'My orders', close: 'Close',
      st_pending: 'Waiting for staff OK', st_new: 'Received', st_preparing: 'Preparing', st_ready: 'Ready', st_served: 'Served', st_cancelled: 'Cancelled',
      noTable: 'Please scan the QR code on your table.', pickTable: 'Choose table',
      emptyCart: 'Your order is empty', offline: 'No internet — reconnecting…',
      online: 'Back online', demo: 'DEMO MODE — data is saved only on this device',
      kitchen: 'Kitchen', counter: 'Counter', waiter: 'Waiter', owner: 'Owner',
      startPrep: 'Start preparing', markReady: 'Ready ✓', markServed: 'Served ✓',
      newOrders: 'New', preparing: 'Preparing', ready: 'Ready',
      tapStart: 'Tap to start the kitchen screen', tapStartSub: 'Turns on the order beep and keeps the screen awake',
      noOrders: 'No orders right now', min: 'min', justNow: 'just now',
      todaySales: "Today's sales", cash: 'Cash', upi: 'UPI', orders: 'Orders',
      openBills: 'Open bills', paidCash: 'Paid · Cash', paidUpi: 'Paid · UPI', print: 'Print',
      cancel: 'Cancel', cancelQ: 'Cancel this order? It will be removed from the bill.',
      paidQ: 'Mark table {t} as paid by {m}?', noBills: 'No open bills', paidToday: 'Paid today',
      login: 'Staff login', email: 'Email', password: 'Password', signIn: 'Sign in', signOut: 'Sign out',
      notStaff: 'This login is not linked to this hotel.', takeOrder: 'Take order', readyServe: 'Ready to serve',
      chooseTable: 'Choose a table', changeTable: 'Change table', orderFor: 'Order for table',
      waiterSent: 'Sent to kitchen — table {t}', nothingReady: 'Nothing waiting to be served',
      menuItems: 'Menu items', tablesQr: 'Tables', settings: 'Settings', addItem: '+ Add item',
      editItem: 'Edit item', edit: 'Edit', nameMl: 'Name (Malayalam)', nameEn: 'Name (English)', category: 'Category',
      price: 'Price (₹)', type: 'Type', photo: 'Photo', save: 'Save', del: 'Delete', delQ: 'Delete this item?',
      inStock: 'In stock', saved: 'Saved', tablesCount: 'Number of tables', printQr: 'Print QR stickers',
      scanToOrder: 'Scan to order', hotelName: 'Hotel name (English)', hotelNameMl: 'Hotel name (Malayalam)',
      upiId: 'UPI ID (for later)', links: 'Screen links', billFor: 'Bill — Table', thanks: 'Thank you! Visit again.',
      orderNo: 'Order', error: 'Something went wrong', outNow: 'is now out of stock — removed from your order',
      removePhoto: 'Remove photo', sortOrder: 'Position in list',
      lockedTitle: 'Menu opens at the table', lockedSub: 'Please ask the waiter to show the QR code for your table.',
      closedTitle: 'Thank you! This table is closed', closedSub: 'The bill is settled, so this menu has closed. To order again, ask the waiter for a new QR.',
      tableOrders: 'Orders from this table', showQr: 'Show QR', closeTable: 'Close table', newQr: 'New QR',
      qrFor: 'Customers at this table scan this to order', closeTableQ: 'Close table {t}? The QR on customers\' phones will stop working.',
      qrOpen: 'QR open', tablesInfo: 'There are no fixed QR stickers. The waiter opens a QR for each table from Waiter mode; it closes when the bill is paid.',
      demoCustomer: 'Demo: open table 1 as a customer', ok: 'Done',
      pendingTitle: 'Waiting for staff to confirm', pendingSub: 'First order from this phone — staff will check your table and confirm. It takes a moment.',
      checkTable: 'New phone — is someone really at this table?', accept: '✓ Yes, accept', reject: '✕ No, reject',
      toConfirm: 'To confirm', confirmPhones: 'Staff confirm the first order from each new phone (stops orders from outside the hotel)',
    },
    ml: {
      app: 'ഡിജിറ്റൽ മെനു', table: 'ടേബിൾ', all: 'എല്ലാം', search: 'വിഭവം തിരയുക…',
      veg: 'വെജ്', nonveg: 'നോൺ-വെജ്', add: 'ചേർക്കുക', out: 'തീർന്നുപോയി',
      items: 'എണ്ണം', item: 'എണ്ണം', viewOrder: 'ഓർഡർ കാണുക', yourOrder: 'നിങ്ങളുടെ ഓർഡർ',
      note: 'അടുക്കളയ്ക്ക് കുറിപ്പ് (ഉദാ: എരിവ് കുറച്ച്)', send: 'ഓർഡർ അയക്കുക', sending: 'അയക്കുന്നു…',
      total: 'ആകെ', sent: 'ഓർഡർ അയച്ചു!', sentSub: 'നിങ്ങളുടെ ഓർഡർ അടുക്കളയിൽ എത്തി.',
      orderMore: 'കൂടുതൽ ഓർഡർ ചെയ്യുക', myOrders: 'ഈ വരവിലെ നിങ്ങളുടെ ഓർഡറുകൾ', myShort: 'എന്റെ ഓർഡറുകൾ', close: 'അടയ്ക്കുക',
      st_pending: 'സ്റ്റാഫ് സ്ഥിരീകരണം കാത്ത്', st_new: 'ലഭിച്ചു', st_preparing: 'തയ്യാറാക്കുന്നു', st_ready: 'റെഡി', st_served: 'വിളമ്പി', st_cancelled: 'റദ്ദാക്കി',
      noTable: 'ദയവായി നിങ്ങളുടെ ടേബിളിലെ QR കോഡ് സ്കാൻ ചെയ്യുക.', pickTable: 'ടേബിൾ തിരഞ്ഞെടുക്കുക',
      emptyCart: 'ഓർഡറിൽ ഒന്നുമില്ല', offline: 'ഇന്റർനെറ്റ് ഇല്ല — വീണ്ടും ബന്ധിപ്പിക്കുന്നു…',
      online: 'ഇന്റർനെറ്റ് തിരിച്ചെത്തി', demo: 'ഡെമോ മോഡ് — വിവരങ്ങൾ ഈ ഫോണിൽ മാത്രം',
      kitchen: 'അടുക്കള', counter: 'കൗണ്ടർ', waiter: 'വെയ്റ്റർ', owner: 'ഉടമ',
      startPrep: 'തയ്യാറാക്കാൻ തുടങ്ങി', markReady: 'റെഡി ✓', markServed: 'വിളമ്പി ✓',
      newOrders: 'പുതിയത്', preparing: 'തയ്യാറാക്കുന്നു', ready: 'റെഡി',
      tapStart: 'അടുക്കള സ്ക്രീൻ തുടങ്ങാൻ ടാപ്പ് ചെയ്യുക', tapStartSub: 'ഓർഡർ ബീപ്പ് ഓണാകും, സ്ക്രീൻ ഓഫാകില്ല',
      noOrders: 'ഇപ്പോൾ ഓർഡറുകൾ ഇല്ല', min: 'മിനിറ്റ്', justNow: 'ഇപ്പോൾ',
      todaySales: 'ഇന്നത്തെ വിൽപ്പന', cash: 'ക്യാഷ്', upi: 'UPI', orders: 'ഓർഡറുകൾ',
      openBills: 'അടയ്ക്കാനുള്ള ബില്ലുകൾ', paidCash: 'അടച്ചു · ക്യാഷ്', paidUpi: 'അടച്ചു · UPI', print: 'പ്രിന്റ്',
      cancel: 'റദ്ദാക്കുക', cancelQ: 'ഈ ഓർഡർ റദ്ദാക്കണോ? ബില്ലിൽ നിന്ന് മാറും.',
      paidQ: 'ടേബിൾ {t} — {m} ആയി പണം അടച്ചോ?', noBills: 'അടയ്ക്കാനുള്ള ബില്ലുകൾ ഇല്ല', paidToday: 'ഇന്ന് അടച്ചത്',
      login: 'സ്റ്റാഫ് ലോഗിൻ', email: 'ഇമെയിൽ', password: 'പാസ്‌വേഡ്', signIn: 'ലോഗിൻ', signOut: 'ലോഗൗട്ട്',
      notStaff: 'ഈ ലോഗിൻ ഈ ഹോട്ടലുമായി ബന്ധിപ്പിച്ചിട്ടില്ല.', takeOrder: 'ഓർഡർ എടുക്കുക', readyServe: 'വിളമ്പാൻ റെഡി',
      chooseTable: 'ടേബിൾ തിരഞ്ഞെടുക്കുക', changeTable: 'ടേബിൾ മാറ്റുക', orderFor: 'ഓർഡർ — ടേബിൾ',
      waiterSent: 'അടുക്കളയിലേക്ക് അയച്ചു — ടേബിൾ {t}', nothingReady: 'വിളമ്പാൻ ഒന്നുമില്ല',
      menuItems: 'മെനു', tablesQr: 'ടേബിളുകൾ', settings: 'സെറ്റിംഗ്സ്', addItem: '+ വിഭവം ചേർക്കുക',
      editItem: 'വിഭവം മാറ്റുക', edit: 'മാറ്റുക', nameMl: 'പേര് (മലയാളം)', nameEn: 'പേര് (English)', category: 'വിഭാഗം',
      price: 'വില (₹)', type: 'തരം', photo: 'ഫോട്ടോ', save: 'സേവ്', del: 'ഡിലീറ്റ്', delQ: 'ഈ വിഭവം ഡിലീറ്റ് ചെയ്യണോ?',
      inStock: 'ലഭ്യം', saved: 'സേവ് ചെയ്തു', tablesCount: 'ടേബിളുകളുടെ എണ്ണം', printQr: 'QR സ്റ്റിക്കറുകൾ പ്രിന്റ് ചെയ്യുക',
      scanToOrder: 'സ്കാൻ ചെയ്ത് ഓർഡർ ചെയ്യൂ', hotelName: 'ഹോട്ടലിന്റെ പേര് (English)', hotelNameMl: 'ഹോട്ടലിന്റെ പേര് (മലയാളം)',
      upiId: 'UPI ID (പിന്നീട്)', links: 'സ്ക്രീൻ ലിങ്കുകൾ', billFor: 'ബിൽ — ടേബിൾ', thanks: 'നന്ദി! വീണ്ടും വരിക.',
      orderNo: 'ഓർഡർ', error: 'എന്തോ പിശക് പറ്റി', outNow: 'തീർന്നുപോയി — ഓർഡറിൽ നിന്ന് മാറ്റി',
      removePhoto: 'ഫോട്ടോ മാറ്റുക', sortOrder: 'ലിസ്റ്റിലെ സ്ഥാനം',
      lockedTitle: 'മെനു ടേബിളിൽ മാത്രം', lockedSub: 'നിങ്ങളുടെ ടേബിളിന്റെ QR കോഡ് കാണിക്കാൻ വെയ്റ്ററോട് പറയുക.',
      closedTitle: 'നന്ദി! ഈ ടേബിൾ അടച്ചു', closedSub: 'ബിൽ അടച്ചതിനാൽ ഈ മെനു അടച്ചു. വീണ്ടും ഓർഡർ ചെയ്യാൻ വെയ്റ്ററോട് പുതിയ QR ചോദിക്കുക.',
      tableOrders: 'ഈ ടേബിളിലെ ഓർഡറുകൾ', showQr: 'QR കാണിക്കുക', closeTable: 'ടേബിൾ അടയ്ക്കുക', newQr: 'പുതിയ QR',
      qrFor: 'ഈ ടേബിളിലെ കസ്റ്റമർമാർ ഇത് സ്കാൻ ചെയ്ത് ഓർഡർ ചെയ്യാം', closeTableQ: 'ടേബിൾ {t} അടയ്ക്കണോ? കസ്റ്റമർമാരുടെ ഫോണിലെ QR പ്രവർത്തിക്കില്ല.',
      qrOpen: 'QR തുറന്നു', tablesInfo: 'ടേബിളിൽ സ്ഥിരമായ QR സ്റ്റിക്കർ ഇല്ല. വെയ്റ്റർ മോഡിൽ നിന്ന് ഓരോ ടേബിളിനും വെയ്റ്റർ QR തുറക്കും; ബിൽ അടച്ചാൽ അത് അടയും.',
      demoCustomer: 'ഡെമോ: ടേബിൾ 1 കസ്റ്റമറായി തുറക്കുക', ok: 'ശരി',
      pendingTitle: 'സ്റ്റാഫ് സ്ഥിരീകരിക്കുന്നു', pendingSub: 'ഈ ഫോണിൽ നിന്നുള്ള ആദ്യ ഓർഡർ — സ്റ്റാഫ് ടേബിൾ നോക്കി സ്ഥിരീകരിക്കും. ഒരു നിമിഷം.',
      checkTable: 'പുതിയ ഫോൺ — ഈ ടേബിളിൽ ശരിക്കും ആളുണ്ടോ?', accept: '✓ ഉണ്ട്, സ്വീകരിക്കുക', reject: '✕ ഇല്ല, നിരസിക്കുക',
      toConfirm: 'സ്ഥിരീകരിക്കാൻ', confirmPhones: 'ഓരോ പുതിയ ഫോണിലെയും ആദ്യ ഓർഡർ സ്റ്റാഫ് സ്ഥിരീകരിക്കണം (ഹോട്ടലിന് പുറത്തുനിന്നുള്ള ഓർഡർ തടയും)',
    },
  };
  let lang = localStorage.getItem('dm_lang') || C.DEFAULT_LANG || 'ml';
  function t(k, vars) {
    let s = (STR[lang] && STR[lang][k]) || STR.en[k] || k;
    if (vars) for (const v in vars) s = s.replace('{' + v + '}', vars[v]);
    return s;
  }
  function setLang(l) {
    lang = l; localStorage.setItem('dm_lang', l);
    document.documentElement.lang = l;
    document.dispatchEvent(new Event('dm:lang'));
  }
  function langToggleHTML() {
    return `<button class="lang-btn" data-lang-toggle>${lang === 'ml' ? 'English' : 'മലയാളം'}</button>`;
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-lang-toggle]')) setLang(lang === 'ml' ? 'en' : 'ml');
  });

  // ---------------- Small utils ----------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => {
    n = Number(n || 0);
    return '₹' + (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };
  const param = (k) => new URLSearchParams(location.search).get(k);
  const slug = () => (param('r') || C.DEFAULT_RESTAURANT || 'demo-hotel').toLowerCase();
  const itemName = (it) => (lang === 'ml' ? (it.name_ml || it.name_en) : it.name_en);
  const itemSub = (it) => (lang === 'ml' ? (it.name_ml ? it.name_en : '') : (it.name_ml || ''));
  const vegMark = (isVeg) => `<span class="vegmark ${isVeg ? 'veg' : 'nonveg'}" title="${isVeg ? t('veg') : t('nonveg')}"><i></i></span>`;
  function minutesAgo(iso) { return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000)); }
  function ago(iso) { const m = minutesAgo(iso); return m < 1 ? t('justNow') : m + ' ' + t('min'); }
  function clock(iso) { return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }); }
  function startOfToday() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }

  let toastTimer;
  function toast(msg, kind) {
    let el = document.getElementById('dm-toast');
    if (!el) { el = document.createElement('div'); el.id = 'dm-toast'; document.body.appendChild(el); }
    el.className = 'toast show ' + (kind || '');
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
  }
  function errMsg(e) {
    const m = (e && (e.message || e.error_description)) || String(e);
    return m.startsWith('OUT_OF_STOCK:') ? m.slice(13) + ' — ' + t('out') : m || t('error');
  }

  // ---------------- Sound ----------------
  let actx = null;
  function unlockAudio() {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { /* no audio */ }
  }
  function beep(times = 2, freq = 880) {
    if (!actx) return;
    let tt = actx.currentTime;
    for (let i = 0; i < times; i++) {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = 'square'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.exponentialRampToValueAtTime(0.35, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.25);
      o.connect(g).connect(actx.destination);
      o.start(tt); o.stop(tt + 0.27);
      tt += 0.35;
    }
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  }

  // ---------------- Keep screen on ----------------
  let wakeLock = null;
  async function keepAwake() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLock !== null) keepAwake();
  });

  // ---------------- Online / offline banner ----------------
  let connOk = true;
  function setConn(ok) {
    if (ok === connOk) return;
    connOk = ok;
    let el = document.getElementById('dm-conn');
    if (!el) { el = document.createElement('div'); el.id = 'dm-conn'; document.body.prepend(el); }
    el.className = ok ? 'conn ok' : 'conn bad';
    el.textContent = ok ? t('online') : t('offline');
    if (ok) setTimeout(() => { if (connOk) el.className = 'conn'; }, 2500);
  }
  window.addEventListener('offline', () => setConn(false));
  window.addEventListener('online', () => setConn(true));

  function demoBanner() {
    if (!window.DMStore || DMStore.mode !== 'demo') return;
    if (document.getElementById('dm-demo')) return;
    const el = document.createElement('div');
    el.id = 'dm-demo'; el.className = 'demo-banner'; el.textContent = t('demo');
    document.body.appendChild(el);
    document.addEventListener('dm:lang', () => (el.textContent = t('demo')));
  }

  // ---------------- Staff login gate ----------------
  // Resolves with the restaurant row once a staff member is signed in.
  async function requireStaff() {
    const r = await DMStore.getRestaurant(slug());
    if (!r) { document.body.innerHTML = `<div class="center-msg">Hotel "${esc(slug())}" not found</div>`; throw new Error('no hotel'); }
    if (DMStore.mode === 'demo') return r;
    const ok = await DMStore.isStaff(r.id).catch(() => false);
    if (ok) return r;
    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'login-wrap';
      const draw = (msg) => {
        wrap.innerHTML = `
          <form class="login-card">
            <div class="login-top">${langToggleHTML()}</div>
            <h2>${esc(r.name_ml && lang === 'ml' ? r.name_ml : r.name)}</h2>
            <p class="muted">${t('login')}</p>
            ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
            <label>${t('email')}<input type="email" name="email" required autocomplete="username"></label>
            <label>${t('password')}<input type="password" name="pw" required autocomplete="current-password"></label>
            <button class="btn primary big" type="submit">${t('signIn')}</button>
          </form>`;
        wrap.querySelector('form').onsubmit = async (e) => {
          e.preventDefault();
          const f = e.target;
          f.querySelector('button').disabled = true;
          try {
            await DMStore.signIn(f.email.value.trim(), f.pw.value);
            if (await DMStore.isStaff(r.id)) { wrap.remove(); document.removeEventListener('dm:lang', onLang); resolve(r); }
            else { await DMStore.signOut(); draw(t('notStaff')); }
          } catch (err) { draw(errMsg(err)); }
        };
      };
      const onLang = () => draw();
      document.addEventListener('dm:lang', onLang);
      draw();
      document.body.appendChild(wrap);
    });
  }

  function staffHeader(r, title, extraHTML = '') {
    const nm = lang === 'ml' && r.name_ml ? r.name_ml : r.name;
    const out = DMStore.mode === 'live' ? `<button class="link-btn" data-signout>${t('signOut')}</button>` : '';
    return `<header class="topbar">
      <div class="tb-left"><a class="home" href="index.html?r=${encodeURIComponent(r.slug)}">◀</a>
        <div><div class="tb-title">${esc(title)}</div><div class="tb-sub">${esc(nm)}</div></div></div>
      <div class="tb-right">${extraHTML}${langToggleHTML()}${out}</div></header>`;
  }
  document.addEventListener('click', async (e) => {
    if (e.target.closest('[data-signout]')) { await DMStore.signOut(); location.reload(); }
  });

  // ---------------- Live data loop ----------------
  // Calls refresh() now, on every realtime change, when the connection comes
  // back, when the screen is shown again, and every `pollMs` as a safety net.
  function live(rid, opts, refresh, pollMs = 20000) {
    let busy = false, again = false;
    const run = async () => {
      if (busy) { again = true; return; }
      busy = true;
      try {
        await refresh();
        if (navigator.onLine) setConn(true);
      } catch (e) {
        console.warn(e);
        if (!navigator.onLine || /fetch|network/i.test(String(e && e.message))) setConn(false);
      }
      busy = false;
      if (again) { again = false; run(); }
    };
    DMStore.subscribe(rid, opts, () => run(), (up) => { if (!up && !navigator.onLine) setConn(false); });
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') run(); });
    setInterval(run, pollMs);
    run();
    return run;
  }

  window.DM = {
    live, t, setLang, get lang() { return lang; }, langToggleHTML, esc, money, param, slug, itemName, itemSub,
    vegMark, minutesAgo, ago, clock, startOfToday, toast, errMsg, unlockAudio, beep, keepAwake,
    setConn, demoBanner, requireStaff, staffHeader,
  };
})();
