// Menu + cart component, shared by the customer menu and waiter mode.
(function () {
  const { t, esc, money, itemName, itemSub, vegMark } = DM;

  DM.MenuUI = function (root, opts) {
    const cartKey = opts.cartKey || 'dm_cart';
    let items = [];
    let cart = load();
    let cat = 'all', q = '', note = '', open = false, sending = false;

    function load() { try { return JSON.parse(sessionStorage.getItem(cartKey)) || {}; } catch (e) { return {}; } }
    function persist() { try { sessionStorage.setItem(cartKey, JSON.stringify(cart)); } catch (e) { /* ignore */ } }
    const byId = (id) => items.find((i) => i.id === id);
    const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
    const total = () => Object.entries(cart).reduce((s, [id, n]) => s + (byId(id) ? byId(id).price * n : 0), 0);
    const cats = () => [...new Set(items.map((i) => i.category))];

    root.innerHTML = `
      <div class="menu-tools">
        <input class="search" type="search" autocomplete="off">
        <div class="chips"></div>
      </div>
      <div class="menu-list"></div>
      <div class="cartbar-wrap"></div>
      <div class="sheet-wrap"></div>`;
    const $search = root.querySelector('.search');
    const $chips = root.querySelector('.chips');
    const $list = root.querySelector('.menu-list');
    const $bar = root.querySelector('.cartbar-wrap');
    const $sheet = root.querySelector('.sheet-wrap');

    function stepper(id, n) {
      return `<div class="stepper"><button data-dec aria-label="-">−</button><b>${n}</b><button data-inc aria-label="+">+</button></div>`;
    }
    function dish(it) {
      const n = cart[it.id] || 0;
      const img = it.photo_url
        ? `<img loading="lazy" src="${esc(it.photo_url)}" alt="">`
        : `<div class="ph">${esc((it.name_ml || it.name_en || '?').slice(0, 1))}</div>`;
      const act = !it.in_stock ? `<span class="out-tag">${t('out')}</span>`
        : n ? stepper(it.id, n) : `<button class="add-btn" data-inc>${t('add')}</button>`;
      return `<div class="dish ${it.in_stock ? '' : 'is-out'}" data-id="${it.id}">
          <div class="dish-img">${img}</div>
          <div class="dish-info">
            <div class="dish-name">${vegMark(it.is_veg)}<span>${esc(itemName(it))}</span></div>
            ${itemSub(it) ? `<div class="dish-sub">${esc(itemSub(it))}</div>` : ''}
            <div class="dish-price">${money(it.price)}</div>
          </div>
          <div class="dish-act">${act}</div>
        </div>`;
    }
    function renderChips() {
      $search.placeholder = t('search');
      $chips.innerHTML = ['all', ...cats()].map((c) =>
        `<button class="chip ${c === cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c === 'all' ? t('all') : c)}</button>`).join('');
    }
    function renderList() {
      const qq = q.trim().toLowerCase();
      let list = items;
      if (qq) list = list.filter((i) => (i.name_en + ' ' + (i.name_ml || '')).toLowerCase().includes(qq));
      if (cat !== 'all') list = list.filter((i) => i.category === cat);
      if (!list.length) { $list.innerHTML = `<p class="muted center pad">—</p>`; return; }
      if (cat === 'all' && !qq) {
        $list.innerHTML = cats().map((c) => `<h3 class="cat-h">${esc(c)}</h3>` +
          list.filter((i) => i.category === c).map(dish).join('')).join('');
      } else $list.innerHTML = list.map(dish).join('');
    }
    function renderBar() {
      const n = count();
      $bar.innerHTML = n && !open ? `<button class="cartbar" data-open>
          <span><b>${n}</b> ${n === 1 ? t('item') : t('items')} · <b>${money(total())}</b></span>
          <span>${t('viewOrder')} ▲</span></button>` : '';
    }
    function renderSheet() {
      if (!open) { $sheet.innerHTML = ''; document.body.classList.remove('noscroll'); return; }
      document.body.classList.add('noscroll');
      const lines = Object.entries(cart).filter(([id]) => byId(id));
      $sheet.innerHTML = `<div class="backdrop" data-close></div>
        <div class="sheet">
          <div class="sheet-h"><h3>${esc(opts.sheetTitle ? opts.sheetTitle() : t('yourOrder'))}</h3><button class="x" data-close>✕</button></div>
          ${lines.length ? lines.map(([id, n]) => { const it = byId(id); return `
            <div class="line" data-id="${id}">
              <div class="line-name">${vegMark(it.is_veg)}<span>${esc(itemName(it))}<small>${money(it.price)}</small></span></div>
              ${stepper(id, n)}
              <div class="line-amt">${money(it.price * n)}</div>
            </div>`; }).join('') : `<p class="muted center pad">${t('emptyCart')}</p>`}
          <textarea class="note" rows="2" maxlength="200" placeholder="${esc(t('note'))}">${esc(note)}</textarea>
          <div class="sheet-total"><span>${t('total')}</span><b>${money(total())}</b></div>
          <button class="btn primary big block" data-send ${!lines.length || sending ? 'disabled' : ''}>${sending ? t('sending') : t('send')}</button>
        </div>`;
    }
    function renderAll() { renderChips(); renderList(); renderBar(); renderSheet(); }
    function refreshQty() { renderList(); renderBar(); if (open) renderSheet(); }

    root.addEventListener('click', async (e) => {
      const el = e.target;
      const idEl = el.closest('[data-id]');
      const id = idEl && idEl.dataset.id;
      if (el.closest('[data-inc]') && id) { cart[id] = Math.min(50, (cart[id] || 0) + 1); persist(); refreshQty(); return; }
      if (el.closest('[data-dec]') && id) { cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; persist(); refreshQty(); return; }
      const c = el.closest('[data-cat]');
      if (c) { cat = c.dataset.cat; renderChips(); renderList(); window.scrollTo({ top: 0 }); return; }
      if (el.closest('[data-open]')) { open = true; renderBar(); renderSheet(); return; }
      if (el.closest('[data-close]')) { open = false; renderSheet(); renderBar(); return; }
      if (el.closest('[data-send]') && !sending) {
        const lines = Object.entries(cart).filter(([i]) => byId(i)).map(([i, qty]) => ({ id: i, qty }));
        if (!lines.length) return;
        sending = true; renderSheet();
        let okSent = false;
        try { okSent = await opts.onSend(lines, note.trim()); } catch (err) { DM.toast(DM.errMsg(err), 'bad'); }
        sending = false;
        if (okSent) { cart = {}; note = ''; open = false; persist(); }
        renderAll();
      }
    });
    root.addEventListener('input', (e) => {
      if (e.target === $search) { q = e.target.value; renderList(); }
      if (e.target.classList.contains('note')) note = e.target.value;
    });
    document.addEventListener('dm:lang', renderAll);

    return {
      setItems(list) {
        const sig = JSON.stringify(list);
        if (sig === this._sig) return; // nothing changed — don't disturb the screen
        this._sig = sig;
        items = list;
        for (const id of Object.keys(cart)) {
          const it = byId(id);
          if (!it || !it.in_stock) { if (it) DM.toast(itemName(it) + ' ' + t('outNow'), 'warn'); delete cart[id]; }
        }
        if (cat !== 'all' && !cats().includes(cat)) cat = 'all';
        persist(); renderAll();
      },
      clear() { cart = {}; note = ''; open = false; persist(); renderAll(); },
      count,
    };
  };
})();
