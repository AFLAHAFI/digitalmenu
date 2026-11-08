// Shared helpers: language, money, sound, screen-awake, offline banner,
// theme, staff login + roles, header.
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
      orderMore: 'Order more', close: 'Close', ok: 'Done', myShort: 'My orders',
      st_new: 'Received', st_preparing: 'Preparing', st_ready: 'Ready', st_served: 'Served', st_cancelled: 'Cancelled',
      emptyCart: 'Your order is empty', offline: 'No internet — reconnecting…',
      online: 'Back online', demo: 'DEMO MODE — data is saved only on this device',
      kitchen: 'Kitchen', counter: 'Counter', waiter: 'Waiter', owner: 'Owner', reports: 'Reports',
      startPrep: 'Start preparing', markReady: 'Ready ✓', markServed: 'Served ✓',
      newOrders: 'New', preparing: 'Preparing', ready: 'Ready',
      tapStart: 'Tap to start the kitchen screen', tapStartSub: 'Turns on the order beep and keeps the screen awake',
      noOrders: 'No orders right now', min: 'min', justNow: 'just now',
      todaySales: "Today's sales", cash: 'Cash', upi: 'UPI', orders: 'Orders',
      openBills: 'Open bills', paidCash: 'Paid · Cash', paidUpi: 'Paid · UPI', print: 'Print',
      cancel: 'Cancel', cancelQ: 'Cancel this order? It will be removed from the bill.',
      paidQ: 'Mark table {t} as paid by {m}?', noBills: 'No open bills', paidToday: 'Paid today',
      login: 'Staff login', loginUser: 'Username or email', password: 'Password', signIn: 'Sign in', signOut: 'Sign out',
      switchUser: 'Switch user', badLogin: 'Wrong username or password', noAccess: 'Your role cannot open this screen.',
      notStaff: 'This login is not linked to this hotel, or it is locked.',
      takeOrder: 'Take order', readyServe: 'Ready to serve', chooseTable: 'Choose a table', changeTable: 'Change table',
      orderFor: 'Order for table', waiterSent: 'Sent to kitchen — table {t}', nothingReady: 'Nothing waiting to be served',
      menuItems: 'Menu', tablesQr: 'Tables', settings: 'Settings', staffTab: 'Staff', brandTab: 'Look', activity: 'Activity',
      addItem: '+ Add item', editItem: 'Edit item', edit: 'Edit', nameMl: 'Name (Malayalam)', nameEn: 'Name (English)',
      category: 'Category', price: 'Price (₹)', type: 'Type', photo: 'Photos', save: 'Save', del: 'Delete',
      delQ: 'Delete this item?', inStock: 'In stock', saved: 'Saved', tablesCount: 'Number of tables',
      hotelName: 'Hotel name (English)', hotelNameMl: 'Hotel name (Malayalam)', upiId: 'UPI ID (for later)',
      links: 'Screen links', billFor: 'Bill — Table', thanks: 'Thank you! Visit again.', orderNo: 'Order',
      error: 'Something went wrong', outNow: 'is now out of stock — removed from your order',
      sortOrder: 'Position', description: 'Short description', special: "Today's special", specialTag: 'Special',
      lockedTitle: 'Menu opens at the table', lockedSub: 'Please ask the waiter to show the QR code for your table.',
      closedTitle: 'Thank you! This table is closed', closedSub: 'The bill is settled, so this menu has closed. To order again, ask the waiter for a new QR.',
      tableOrders: 'Orders from this table', showQr: 'Show QR', closeTable: 'Close table',
      qrFor: 'Customers at this table scan this to order', closeTableQ: "Close table {t}? The QR on customers' phones will stop working.",
      tablesInfo: 'There are no fixed QR stickers. The waiter opens a QR for each table from Waiter mode; it closes when the bill is paid.',
      demoCustomer: 'Demo: open table 1 as a customer',
      queued: 'No internet — order saved. It will be sent automatically.', queuedN: '{n} order(s) waiting for internet',
      queuedSent: 'Saved order sent ✓',
      // staff
      staff: 'Staff', addStaff: '+ Add staff', editStaff: 'Edit staff', displayName: 'Name', username: 'Username',
      role: 'Role', newPassword: 'New password (leave empty to keep)', passwordReq: 'Password (min 6)',
      r_owner: 'Owner', r_manager: 'Manager', r_waiter: 'Waiter', r_kitchen: 'Kitchen', r_cashier: 'Cashier',
      lock: 'Lock login', unlock: 'Unlock login', locked: 'Locked', removeStaff: 'Remove', removeStaffQ: 'Remove {n}? Their login will be deleted.',
      you: 'you', loginHint: 'Staff log in with this username at:', pinTip: 'Tip: a 6-digit number works as an easy PIN.',
      // look
      logo: 'Logo', banner: 'Banner photo', themeColor: 'Theme colour', catPhotos: 'Category photos', choose: 'Choose photo',
      removePhoto: 'Remove', crop: 'Move and zoom, then press Use', usePhoto: 'Use photo', makeMain: 'Main',
      // reports
      today: 'Today', yesterday: 'Yesterday', last7: '7 days', last30: '30 days', thisMonth: 'This month', custom: 'Custom',
      from: 'From', to: 'To', show: 'Show', sales: 'Sales', bills: 'Bills', avgBill: 'Average bill', itemsSold: 'Items sold',
      cancelled: 'Cancelled', prepTime: 'Avg. kitchen time', salesByDay: 'Sales by day', busyHours: 'Busy hours (orders)',
      topItems: 'Top dishes', byStaff: 'By staff', customerQr: 'Customer QR', unpaid: 'Not yet paid', downloadCsv: 'Download Excel (CSV)',
      dayClose: 'Print day report', qty: 'Qty', amount: 'Amount', noData: 'No orders in this period',
      stockPanel: 'Stock', theme: 'Theme',
      // activity
      a_order_cancelled: 'Order cancelled', a_bill_paid: 'Bill paid', a_price_changed: 'Price changed', a_item_added: 'Dish added',
      a_item_deleted: 'Dish deleted', a_staff_added: 'Staff added', a_staff_updated: 'Staff changed', a_staff_removed: 'Staff removed',
    },
    ml: {
      app: 'ഡിജിറ്റൽ മെനു', table: 'ടേബിൾ', all: 'എല്ലാം', search: 'വിഭവം തിരയുക…',
      veg: 'വെജ്', nonveg: 'നോൺ-വെജ്', add: 'ചേർക്കുക', out: 'തീർന്നുപോയി',
      items: 'എണ്ണം', item: 'എണ്ണം', viewOrder: 'ഓർഡർ കാണുക', yourOrder: 'നിങ്ങളുടെ ഓർഡർ',
      note: 'അടുക്കളയ്ക്ക് കുറിപ്പ് (ഉദാ: എരിവ് കുറച്ച്)', send: 'ഓർഡർ അയക്കുക', sending: 'അയക്കുന്നു…',
      total: 'ആകെ', sent: 'ഓർഡർ അയച്ചു!', sentSub: 'നിങ്ങളുടെ ഓർഡർ അടുക്കളയിൽ എത്തി.',
      orderMore: 'കൂടുതൽ ഓർഡർ ചെയ്യുക', close: 'അടയ്ക്കുക', ok: 'ശരി', myShort: 'എന്റെ ഓർഡറുകൾ',
      st_new: 'ലഭിച്ചു', st_preparing: 'തയ്യാറാക്കുന്നു', st_ready: 'റെഡി', st_served: 'വിളമ്പി', st_cancelled: 'റദ്ദാക്കി',
      emptyCart: 'ഓർഡറിൽ ഒന്നുമില്ല', offline: 'ഇന്റർനെറ്റ് ഇല്ല — വീണ്ടും ബന്ധിപ്പിക്കുന്നു…',
      online: 'ഇന്റർനെറ്റ് തിരിച്ചെത്തി', demo: 'ഡെമോ മോഡ് — വിവരങ്ങൾ ഈ ഫോണിൽ മാത്രം',
      kitchen: 'അടുക്കള', counter: 'കൗണ്ടർ', waiter: 'വെയ്റ്റർ', owner: 'ഉടമ', reports: 'റിപ്പോർട്ട്',
      startPrep: 'തയ്യാറാക്കാൻ തുടങ്ങി', markReady: 'റെഡി ✓', markServed: 'വിളമ്പി ✓',
      newOrders: 'പുതിയത്', preparing: 'തയ്യാറാക്കുന്നു', ready: 'റെഡി',
      tapStart: 'അടുക്കള സ്ക്രീൻ തുടങ്ങാൻ ടാപ്പ് ചെയ്യുക', tapStartSub: 'ഓർഡർ ബീപ്പ് ഓണാകും, സ്ക്രീൻ ഓഫാകില്ല',
      noOrders: 'ഇപ്പോൾ ഓർഡറുകൾ ഇല്ല', min: 'മിനിറ്റ്', justNow: 'ഇപ്പോൾ',
      todaySales: 'ഇന്നത്തെ വിൽപ്പന', cash: 'ക്യാഷ്', upi: 'UPI', orders: 'ഓർഡറുകൾ',
      openBills: 'അടയ്ക്കാനുള്ള ബില്ലുകൾ', paidCash: 'അടച്ചു · ക്യാഷ്', paidUpi: 'അടച്ചു · UPI', print: 'പ്രിന്റ്',
      cancel: 'റദ്ദാക്കുക', cancelQ: 'ഈ ഓർഡർ റദ്ദാക്കണോ? ബില്ലിൽ നിന്ന് മാറും.',
      paidQ: 'ടേബിൾ {t} — {m} ആയി പണം അടച്ചോ?', noBills: 'അടയ്ക്കാനുള്ള ബില്ലുകൾ ഇല്ല', paidToday: 'ഇന്ന് അടച്ചത്',
      login: 'സ്റ്റാഫ് ലോഗിൻ', loginUser: 'യൂസർനെയിം അല്ലെങ്കിൽ ഇമെയിൽ', password: 'പാസ്‌വേഡ്', signIn: 'ലോഗിൻ', signOut: 'ലോഗൗട്ട്',
      switchUser: 'ആൾ മാറുക', badLogin: 'യൂസർനെയിം അല്ലെങ്കിൽ പാസ്‌വേഡ് തെറ്റാണ്', noAccess: 'നിങ്ങളുടെ റോളിന് ഈ സ്ക്രീൻ തുറക്കാൻ അനുമതിയില്ല.',
      notStaff: 'ഈ ലോഗിൻ ഈ ഹോട്ടലുമായി ബന്ധിപ്പിച്ചിട്ടില്ല, അല്ലെങ്കിൽ ലോക്ക് ചെയ്തിരിക്കുന്നു.',
      takeOrder: 'ഓർഡർ എടുക്കുക', readyServe: 'വിളമ്പാൻ റെഡി', chooseTable: 'ടേബിൾ തിരഞ്ഞെടുക്കുക', changeTable: 'ടേബിൾ മാറ്റുക',
      orderFor: 'ഓർഡർ — ടേബിൾ', waiterSent: 'അടുക്കളയിലേക്ക് അയച്ചു — ടേബിൾ {t}', nothingReady: 'വിളമ്പാൻ ഒന്നുമില്ല',
      menuItems: 'മെനു', tablesQr: 'ടേബിളുകൾ', settings: 'സെറ്റിംഗ്സ്', staffTab: 'സ്റ്റാഫ്', brandTab: 'ഡിസൈൻ', activity: 'പ്രവർത്തനങ്ങൾ',
      addItem: '+ വിഭവം ചേർക്കുക', editItem: 'വിഭവം മാറ്റുക', edit: 'മാറ്റുക', nameMl: 'പേര് (മലയാളം)', nameEn: 'പേര് (English)',
      category: 'വിഭാഗം', price: 'വില (₹)', type: 'തരം', photo: 'ഫോട്ടോകൾ', save: 'സേവ്', del: 'ഡിലീറ്റ്',
      delQ: 'ഈ വിഭവം ഡിലീറ്റ് ചെയ്യണോ?', inStock: 'ലഭ്യം', saved: 'സേവ് ചെയ്തു', tablesCount: 'ടേബിളുകളുടെ എണ്ണം',
      hotelName: 'ഹോട്ടലിന്റെ പേര് (English)', hotelNameMl: 'ഹോട്ടലിന്റെ പേര് (മലയാളം)', upiId: 'UPI ID (പിന്നീട്)',
      links: 'സ്ക്രീൻ ലിങ്കുകൾ', billFor: 'ബിൽ — ടേബിൾ', thanks: 'നന്ദി! വീണ്ടും വരിക.', orderNo: 'ഓർഡർ',
      error: 'എന്തോ പിശക് പറ്റി', outNow: 'തീർന്നുപോയി — ഓർഡറിൽ നിന്ന് മാറ്റി',
      sortOrder: 'സ്ഥാനം', description: 'ചെറിയ വിവരണം', special: 'ഇന്നത്തെ സ്പെഷ്യൽ', specialTag: 'സ്പെഷ്യൽ',
      lockedTitle: 'മെനു ടേബിളിൽ മാത്രം', lockedSub: 'നിങ്ങളുടെ ടേബിളിന്റെ QR കോഡ് കാണിക്കാൻ വെയ്റ്ററോട് പറയുക.',
      closedTitle: 'നന്ദി! ഈ ടേബിൾ അടച്ചു', closedSub: 'ബിൽ അടച്ചതിനാൽ ഈ മെനു അടച്ചു. വീണ്ടും ഓർഡർ ചെയ്യാൻ വെയ്റ്ററോട് പുതിയ QR ചോദിക്കുക.',
      tableOrders: 'ഈ ടേബിളിലെ ഓർഡറുകൾ', showQr: 'QR കാണിക്കുക', closeTable: 'ടേബിൾ അടയ്ക്കുക',
      qrFor: 'ഈ ടേബിളിലെ കസ്റ്റമർമാർ ഇത് സ്കാൻ ചെയ്ത് ഓർഡർ ചെയ്യാം', closeTableQ: 'ടേബിൾ {t} അടയ്ക്കണോ? കസ്റ്റമർമാരുടെ ഫോണിലെ QR പ്രവർത്തിക്കില്ല.',
      tablesInfo: 'ടേബിളിൽ സ്ഥിരമായ QR സ്റ്റിക്കർ ഇല്ല. വെയ്റ്റർ മോഡിൽ നിന്ന് ഓരോ ടേബിളിനും വെയ്റ്റർ QR തുറക്കും; ബിൽ അടച്ചാൽ അത് അടയും.',
      demoCustomer: 'ഡെമോ: ടേബിൾ 1 കസ്റ്റമറായി തുറക്കുക',
      queued: 'ഇന്റർനെറ്റ് ഇല്ല — ഓർഡർ സൂക്ഷിച്ചു. നെറ്റ് വന്നാൽ തനിയെ അയക്കും.', queuedN: '{n} ഓർഡർ ഇന്റർനെറ്റിനായി കാത്തിരിക്കുന്നു',
      queuedSent: 'സൂക്ഷിച്ച ഓർഡർ അയച്ചു ✓',
      staff: 'സ്റ്റാഫ്', addStaff: '+ സ്റ്റാഫിനെ ചേർക്കുക', editStaff: 'സ്റ്റാഫ് മാറ്റുക', displayName: 'പേര്', username: 'യൂസർനെയിം',
      role: 'റോൾ', newPassword: 'പുതിയ പാസ്‌വേഡ് (മാറ്റണ്ടെങ്കിൽ ഒഴിച്ചിടുക)', passwordReq: 'പാസ്‌വേഡ് (കുറഞ്ഞത് 6)',
      r_owner: 'ഉടമ', r_manager: 'മാനേജർ', r_waiter: 'വെയ്റ്റർ', r_kitchen: 'അടുക്കള', r_cashier: 'കാഷ്യർ',
      lock: 'ലോഗിൻ ലോക്ക് ചെയ്യുക', unlock: 'ലോക്ക് മാറ്റുക', locked: 'ലോക്ക്', removeStaff: 'നീക്കം ചെയ്യുക', removeStaffQ: '{n}-നെ നീക്കം ചെയ്യണോ? ലോഗിൻ ഡിലീറ്റ് ആകും.',
      you: 'നിങ്ങൾ', loginHint: 'ഈ യൂസർനെയിം ഉപയോഗിച്ച് ഇവിടെ ലോഗിൻ ചെയ്യാം:', pinTip: 'ടിപ്പ്: 6 അക്ക നമ്പർ എളുപ്പമുള്ള PIN ആയി ഉപയോഗിക്കാം.',
      logo: 'ലോഗോ', banner: 'ബാനർ ഫോട്ടോ', themeColor: 'തീം നിറം', catPhotos: 'വിഭാഗ ഫോട്ടോകൾ', choose: 'ഫോട്ടോ തിരഞ്ഞെടുക്കുക',
      removePhoto: 'മാറ്റുക', crop: 'നീക്കി സൂം ചെയ്യുക, പിന്നെ ഉപയോഗിക്കുക അമർത്തുക', usePhoto: 'ഉപയോഗിക്കുക', makeMain: 'പ്രധാനം',
      today: 'ഇന്ന്', yesterday: 'ഇന്നലെ', last7: '7 ദിവസം', last30: '30 ദിവസം', thisMonth: 'ഈ മാസം', custom: 'തീയതി',
      from: 'മുതൽ', to: 'വരെ', show: 'കാണിക്കുക', sales: 'വിൽപ്പന', bills: 'ബില്ലുകൾ', avgBill: 'ശരാശരി ബിൽ', itemsSold: 'വിറ്റ എണ്ണം',
      cancelled: 'റദ്ദാക്കിയത്', prepTime: 'ശരാശരി അടുക്കള സമയം', salesByDay: 'ദിവസം തിരിച്ചുള്ള വിൽപ്പന', busyHours: 'തിരക്കുള്ള സമയം (ഓർഡർ)',
      topItems: 'കൂടുതൽ വിറ്റ വിഭവങ്ങൾ', byStaff: 'സ്റ്റാഫ് തിരിച്ച്', customerQr: 'കസ്റ്റമർ QR', unpaid: 'അടയ്ക്കാനുള്ളത്', downloadCsv: 'Excel (CSV) ഡൗൺലോഡ്',
      dayClose: 'ദിവസ റിപ്പോർട്ട് പ്രിന്റ്', qty: 'എണ്ണം', amount: 'തുക', noData: 'ഈ കാലയളവിൽ ഓർഡറുകൾ ഇല്ല',
      stockPanel: 'സ്റ്റോക്ക്', theme: 'തീം',
      a_order_cancelled: 'ഓർഡർ റദ്ദാക്കി', a_bill_paid: 'ബിൽ അടച്ചു', a_price_changed: 'വില മാറ്റി', a_item_added: 'വിഭവം ചേർത്തു',
      a_item_deleted: 'വിഭവം ഡിലീറ്റ് ചെയ്തു', a_staff_added: 'സ്റ്റാഫിനെ ചേർത്തു', a_staff_updated: 'സ്റ്റാഫ് മാറ്റം', a_staff_removed: 'സ്റ്റാഫിനെ നീക്കി',
    },
  };
  let lang = localStorage.getItem('dm_lang') || C.DEFAULT_LANG || 'ml';
  document.documentElement.lang = lang;
  function t(k, vars) {
    let s = (STR[lang] && STR[lang][k]) || STR.en[k] || k;
    if (vars) for (const v in vars) s = s.split('{' + v + '}').join(vars[v]);
    return s;
  }
  function setLang(l) {
    lang = l; localStorage.setItem('dm_lang', l);
    document.documentElement.lang = l;
    document.dispatchEvent(new Event('dm:lang'));
  }
  const langToggleHTML = () => `<button class="lang-btn" data-lang-toggle>${lang === 'ml' ? 'English' : 'മലയാളം'}</button>`;
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-lang-toggle]')) setLang(lang === 'ml' ? 'en' : 'ml');
  });

  // ---------------- Theme (light / dark) + hotel colour ----------------
  const themePref = () => localStorage.getItem('dm_theme') || 'auto';
  function applyTheme() {
    const p = themePref();
    const dark = p === 'dark' || (p === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  function cycleTheme() {
    const next = { auto: 'dark', dark: 'light', light: 'auto' }[themePref()];
    localStorage.setItem('dm_theme', next); applyTheme(); return next;
  }
  applyTheme();
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  const themeIcon = () => ({ auto: '◐', dark: '☾', light: '☀' }[themePref()]);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-theme-toggle]');
    if (b) { cycleTheme(); b.textContent = themeIcon(); }
  });
  // hotel brand colour -> CSS variables
  function applyBrand(color) {
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return;
    const n = parseInt(color.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const shade = (f) => '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c * f))).toString(16).padStart(2, '0')).join('');
    const s = document.documentElement.style;
    s.setProperty('--leaf', color); s.setProperty('--leaf-d', shade(0.78));
    s.setProperty('--leaf-l', `rgba(${r},${g},${b},.12)`);
    const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = color;
  }

  // ---------------- Small utils ----------------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => {
    n = Number(n || 0);
    return '₹' + (Number.isInteger(n) ? n.toLocaleString('en-IN') : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };
  const param = (k) => new URLSearchParams(location.search).get(k);
  const slug = () => (param('r') || localStorage.getItem('dm_last_slug') || C.DEFAULT_RESTAURANT || 'demo-hotel').toLowerCase();
  const itemName = (it) => (lang === 'ml' ? (it.name_ml || it.name_en) : it.name_en);
  const itemSub = (it) => (lang === 'ml' ? (it.name_ml ? it.name_en : '') : (it.name_ml || ''));
  const vegMark = (isVeg) => `<span class="vegmark ${isVeg ? 'veg' : 'nonveg'}" title="${isVeg ? t('veg') : t('nonveg')}"><i></i></span>`;
  const minutesAgo = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  const ago = (iso) => { const m = minutesAgo(iso); return m < 1 ? t('justNow') : m + ' ' + t('min'); };
  const clock = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));
  const isNetErr = (e) => !navigator.onLine || /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout/i.test(String(e && (e.message || e)));

  let toastTimer;
  function toast(msg, kind) {
    let el = document.getElementById('dm-toast');
    if (!el) { el = document.createElement('div'); el.id = 'dm-toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.className = 'toast show ' + (kind || '');
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast'), 3400);
  }
  function errMsg(e) {
    const m = (e && (e.message || e.error_description || e.error)) || String(e || '');
    if (m.startsWith('OUT_OF_STOCK:')) return m.slice(13) + ' — ' + t('out');
    if (/invalid login credentials/i.test(m)) return t('badLogin');
    if (isNetErr(e)) return t('offline');
    return m || t('error');
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
  let wakeLock = null, wantWake = false;
  async function keepAwake() {
    wantWake = true;
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wantWake) keepAwake();
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
    if (!window.DMStore || DMStore.mode !== 'demo' || document.getElementById('dm-demo')) return;
    const el = document.createElement('div');
    el.id = 'dm-demo'; el.className = 'demo-banner'; el.textContent = t('demo');
    document.body.appendChild(el);
    document.addEventListener('dm:lang', () => (el.textContent = t('demo')));
  }

  // ---------------- Roles & screens ----------------
  const SCREENS = {
    waiter: ['owner', 'manager', 'waiter', 'cashier'],
    kitchen: ['owner', 'manager', 'kitchen'],
    counter: ['owner', 'manager', 'cashier'],
    admin: ['owner', 'manager'],
    reports: ['owner', 'manager'],
  };
  const SCREEN_ICON = { waiter: '🧑‍🍳', kitchen: '🍳', counter: '🧾', admin: '⚙️', reports: '📊' };
  const screenTitle = (s) => ({ waiter: t('waiter'), kitchen: t('kitchen'), counter: t('counter'), admin: t('owner'), reports: t('reports') }[s]);
  const screensFor = (role) => Object.keys(SCREENS).filter((s) => SCREENS[s].includes(role));
  const homeFor = (role) => ({ waiter: 'waiter', kitchen: 'kitchen', cashier: 'counter' }[role] || 'index');
  const link = (page, r) => `${page}.html?r=${encodeURIComponent(r.slug)}`;

  // staff log in with a username; this must match staffEmail() in the staff-admin function
  const staffEmail = (username, hotelSlug) => `${username.trim().toLowerCase()}@${hotelSlug}.staff.dmenu.app`;
  const recentKey = (s) => 'dm_recent_' + s;
  function rememberUser(s, me) {
    if (!me || !me.username) return;
    let list = [];
    try { list = JSON.parse(localStorage.getItem(recentKey(s))) || []; } catch (e) { /* ignore */ }
    list = [{ username: me.username, name: me.display_name || me.username }, ...list.filter((x) => x.username !== me.username)].slice(0, 8);
    localStorage.setItem(recentKey(s), JSON.stringify(list));
  }
  function recentUsers(s) { try { return JSON.parse(localStorage.getItem(recentKey(s))) || []; } catch (e) { return []; } }

  let signingOut = false;
  async function signOut() { signingOut = true; await DMStore.signOut(); location.reload(); }

  // Resolves with { r, me } once someone allowed on this screen is signed in.
  async function requireStaff(screen) {
    let r;
    try { r = await DMStore.getRestaurant(slug()); }
    catch (e) {
      document.body.innerHTML = `<div class="center-msg">${t('offline')}<br><br><button class="btn" onclick="location.reload()">↻</button></div>`;
      throw e;
    }
    if (!r) { document.body.innerHTML = `<div class="center-msg">Hotel "${esc(slug())}" not found</div>`; throw new Error('no hotel'); }
    localStorage.setItem('dm_last_slug', r.slug);
    applyBrand(r.theme_color);
    const allowed = SCREENS[screen] || Object.keys({ owner: 1, manager: 1, waiter: 1, kitchen: 1, cashier: 1 });

    // session ended elsewhere (password changed, locked, expired) -> back to login
    DMStore.onAuthChange((ev) => { if (ev === 'SIGNED_OUT' && !signingOut) location.reload(); });

    let me = await DMStore.myRole(r.id).catch(() => null);
    if (me && allowed.includes(me.role)) { rememberUser(r.slug, me); return { r, me }; }
    if (me) { noAccess(r, me); throw new Error('no access'); }

    return new Promise((resolve) => {
      const wrap = document.createElement('div');
      wrap.className = 'login-wrap';
      let msg = '';
      const draw = () => {
        const recent = recentUsers(r.slug);
        wrap.innerHTML = `
          <form class="login-card" autocomplete="on">
            <div class="login-top">${langToggleHTML()}</div>
            ${r.logo_url ? `<img class="login-logo" src="${esc(r.logo_url)}" alt="">` : ''}
            <h2>${esc(r.name_ml && lang === 'ml' ? r.name_ml : r.name)}</h2>
            <p class="muted">${t('login')}${screenTitle(screen) ? ' · ' + esc(screenTitle(screen)) : ''}</p>
            ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
            ${recent.length ? `<div class="recent">${recent.map((u) => `<button type="button" class="chip" data-recent="${esc(u.username)}">${esc(u.name)}</button>`).join('')}</div>` : ''}
            <label>${t('loginUser')}<input name="user" required autocomplete="username" autocapitalize="none" spellcheck="false"></label>
            <label>${t('password')}<input type="password" name="pw" required autocomplete="current-password"></label>
            <button class="btn primary big" type="submit">${t('signIn')}</button>
          </form>`;
        const f = wrap.querySelector('form');
        wrap.querySelectorAll('[data-recent]').forEach((b) => (b.onclick = () => { f.user.value = b.dataset.recent; f.pw.focus(); }));
        f.onsubmit = async (e) => {
          e.preventDefault();
          const btn = f.querySelector('[type=submit]'); btn.disabled = true;
          const login = f.user.value.trim();
          try {
            await DMStore.signIn(login.includes('@') ? login : staffEmail(login, r.slug), f.pw.value);
            me = await DMStore.myRole(r.id);
            if (!me) { await DMStore.signOut(); msg = t('notStaff'); draw(); return; }
            rememberUser(r.slug, me);
            wrap.remove(); document.removeEventListener('dm:lang', draw);
            if (!allowed.includes(me.role)) { noAccess(r, me); return; }
            resolve({ r, me });
          } catch (err) { msg = errMsg(err); draw(); }
        };
      };
      document.addEventListener('dm:lang', draw);
      draw();
      document.body.appendChild(wrap);
      setTimeout(() => { const i = wrap.querySelector('[name=user]'); if (i) i.focus(); }, 50);
    });
  }

  function noAccess(r, me) {
    const draw = () => {
      document.body.innerHTML = `<div class="login-wrap"><div class="login-card">
        <h2>${esc(me.display_name || me.username || '')}</h2><p class="muted">${t('r_' + me.role)}</p>
        <p class="err">${t('noAccess')}</p>
        ${screensFor(me.role).map((s) => `<a class="btn big block" href="${link(s, r)}">${SCREEN_ICON[s]} ${esc(screenTitle(s))}</a>`).join('')}
        <button class="btn block" data-signout>${t('switchUser')}</button></div></div>`;
    };
    draw(); document.addEventListener('dm:lang', draw);
  }

  function staffHeader(r, me, screen, extraHTML = '') {
    const nm = lang === 'ml' && r.name_ml ? r.name_ml : r.name;
    const nav = me ? screensFor(me.role).filter((s) => s !== screen) : [];
    const who = me && DMStore.mode === 'live' ? `<span class="who">${esc(me.display_name || me.username || '')}</span>` : '';
    return `<header class="topbar">
      <div class="tb-left">
        ${r.logo_url ? `<img class="tb-logo" src="${esc(r.logo_url)}" alt="">` : ''}
        <div><div class="tb-title">${SCREEN_ICON[screen] || ''} ${esc(screenTitle(screen) || '')}</div><div class="tb-sub">${esc(nm)}</div></div></div>
      <div class="tb-right">${extraHTML}${langToggleHTML()}
        <details class="menu-dd"><summary aria-label="menu">☰</summary><div class="dd">
          ${who}
          <a href="index.html?r=${encodeURIComponent(r.slug)}">🏠 ${esc(t('app'))}</a>
          ${nav.map((s) => `<a href="${link(s, r)}">${SCREEN_ICON[s]} ${esc(screenTitle(s))}</a>`).join('')}
          <button type="button" data-theme-toggle-row>${themeIcon()} ${t('theme')}</button>
          ${DMStore.mode === 'live' ? `<button type="button" data-signout>⇄ ${t('switchUser')}</button>` : ''}
        </div></details></div></header>`;
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-signout]')) signOut();
    const tr = e.target.closest('[data-theme-toggle-row]');
    if (tr) { cycleTheme(); tr.textContent = themeIcon() + ' ' + t('theme'); }
    // close open header menus when tapping elsewhere
    document.querySelectorAll('details.menu-dd[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
  });

  // ---------------- PWA ----------------
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  window.DM = {
    t, setLang, get lang() { return lang; }, langToggleHTML, esc, money, param, slug, itemName, itemSub,
    vegMark, minutesAgo, ago, clock, startOfToday, uuid, isNetErr, toast, errMsg, unlockAudio, beep, keepAwake,
    setConn, demoBanner, requireStaff, staffHeader, staffEmail, applyBrand, applyTheme, themeIcon,
    SCREENS, screensFor, homeFor, screenTitle, SCREEN_ICON, link, signOut,
  };
})();
