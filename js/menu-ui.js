// Menu + cart component, shared by the customer menu and waiter mode.
(function () {
  const { t, esc, money, itemName, itemSub, vegMark } = DM;

  DM.MenuUI = function (root, opts) {
    // opts: { cartKey, onSend(lines, note) -> Promise<bool>, sheetTitle(), categoryPhotos, compact }
    const cartKey = opts.cartKey || 'dm_cart';
    let items = [], sig = '';
    let cart = load();
    let cat = 'all', q = '', note = '', open = false, sending = false, detail = null;
    let catPhotos = opts.categoryPhotos || {};

    function load() { try { return JSON.parse(sessionStorage.getItem(cartKey)) || {}; } catch (e) { return {}; } }
    function persist() { try { sessionStorage.setItem(cartKey, JSON.stringify(cart)); } catch (e) { /* ignore */ } }
    const byId = (id) => items.find((i) => i.id === id);
    const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
    const total = () => Object.entries(cart).reduce((s, [id, n]) => s + (byId(id) ? byId(id).price * n : 0), 0);
    const cats = () => [...new Set(items.map((i) => i.category))];
    const photosOf = (it) => [it.photo_url, ...(it.photos || [])].filter(Boolean);

    root.innerHTML = `
      <div class="menu-tools">
        <input class="search" type="search" autocomplete="off" enterkeyhint="search">
        <div class="chips"></div>
      </div>
      <div class="menu-list"></div>
      <div class="cartbar-wrap"></div>
      <div class="sheet-wrap"></div>
      <div class="detail-wrap"></div>`;
    const $search = root.querySelector('.search');
    const $chips = root.querySelector('.chips');
    const $list = root.querySelector('.menu-list');
    const $bar = root.querySelector('.cartbar-wrap');
    const $sheet = root.querySelector('.sheet-wrap');
    const $detail = root.querySelector('.detail-wrap');

    const stepper = (n) => `<div class="stepper"><button data-dec aria-label="-">−</button><b>${n}</b><button data-inc aria-label="+">+</button></div>`;
    const actionFor = (it) => {
      const n = cart[it.id] || 0;
      return !it.in_stock ? `<span class="out-tag">${t('out')}</span>` : n ? stepper(n) : `<button class="add-btn" data-inc>${t('add')}</button>`;
    };
    function dish(it) {
      const ph = photosOf(it)[0];
      const img = ph ? `<img loading="lazy" decoding="async" src="${esc(ph)}" alt="">`
        : `<div class="ph">${esc((it.name_ml || it.name_en || '?').slice(0, 1))}</div>`;
      return `<div class="dish ${it.in_stock ? '' : 'is-out'}" data-id="${it.id}">
          <button class="dish-img" data-detail aria-label="photo">${img}${photosOf(it).length > 1 ? `<span class="ph-n">${photosOf(it).length}</span>` : ''}</button>
          <div class="dish-info" data-detail>
            <div class="dish-name">${vegMark(it.is_veg)}<span>${esc(itemName(it))}</span>${it.is_special ? `<span class="sp-tag">★</span>` : ''}</div>
            ${itemSub(it) ? `<div class="dish-sub">${esc(itemSub(it))}</div>` : ''}
            ${it.description && !opts.compact ? `<div class="dish-desc">${esc(it.description)}</div>` : ''}
            <div class="dish-price">${money(it.price)}</div>
          </div>
          <div class="dish-act">${actionFor(it)}</div>
        </div>`;
    }
    function renderChips() {
      $search.placeholder = t('search');
      $chips.innerHTML = ['all', ...cats()].map((c) => {
        const p = c !== 'all' && catPhotos[c];
        return `<button class="chip ${c === cat ? 'on' : ''} ${p ? 'has-ph' : ''}" data-cat="${esc(c)}">${p ? `<img src="${esc(p)}" alt="">` : ''}${esc(c === 'all' ? t('all') : c)}</button>`;
      }).join('');
    }
    function renderList() {
      const qq = q.trim().toLowerCase();
      let list = items;
      if (qq) list = list.filter((i) => (i.name_en + ' ' + (i.name_ml || '') + ' ' + (i.description || '')).toLowerCase().includes(qq));
      if (cat !== 'all') list = list.filter((i) => i.category === cat);
      if (!list.length) { $list.innerHTML = `<p class="muted center pad">—</p>`; return; }
      if (cat === 'all' && !qq) {
        const specials = items.filter((i) => i.is_special && i.in_stock);
        $list.innerHTML = (specials.length ? `<h3 class="cat-h sp">★ ${t('special')}</h3>` + specials.map(dish).join('') : '') +
          cats().map((c) => `<h3 class="cat-h">${esc(c)}</h3>` + list.filter((i) => i.category === c).map(dish).join('')).join('');
      } else $list.innerHTML = list.map(dish).join('');
    }
    function renderBar() {
      const n = count();
      $bar.innerHTML = n && !open ? `<button class="cartbar" data-open>
          <span><b>${n}</b> ${n === 1 ? t('item') : t('items')} · <b>${money(total())}</b></span>
          <span>${t('viewOrder')} ▲</span></button>` : '';
    }
    function lockScroll() { document.body.classList.toggle('noscroll', open || !!detail); }
    function renderSheet() {
      if (!open) { $sheet.innerHTML = ''; lockScroll(); return; }
      lockScroll();
      const lines = Object.entries(cart).filter(([id]) => byId(id));
      const still = $sheet.querySelector('.sheet') ? 'still' : '';
      $sheet.innerHTML = `<div class="backdrop" data-close></div>
        <div class="sheet ${still}" role="dialog" aria-modal="true">
          <div class="sheet-h"><h3>${esc(opts.sheetTitle ? opts.sheetTitle() : t('yourOrder'))}</h3><button class="x" data-close aria-label="close">✕</button></div>
          ${lines.length ? lines.map(([id, n]) => { const it = byId(id); return `
            <div class="line" data-id="${id}">
              <div class="line-name">${vegMark(it.is_veg)}<span>${esc(itemName(it))}<small>${money(it.price)}</small></span></div>
              ${stepper(n)}
              <div class="line-amt">${money(it.price * n)}</div>
            </div>`; }).join('') : `<p class="muted center pad">${t('emptyCart')}</p>`}
          <textarea class="note" rows="2" maxlength="200" placeholder="${esc(t('note'))}">${esc(note)}</textarea>
          <div class="sheet-total"><span>${t('total')}</span><b>${money(total())}</b></div>
          <button class="btn primary big block" data-send ${!lines.length || sending ? 'disabled' : ''}>${sending ? t('sending') : t('send')}</button>
        </div>`;
    }
    function renderDetail() {
      const it = detail && byId(detail);
      if (!it) { detail = null; $detail.innerHTML = ''; lockScroll(); return; }
      lockScroll();
      const cur = $detail.querySelector('.sheet.detail');
      if (cur && cur.dataset.id === it.id) { cur.querySelector('.detail-foot .dish-act').innerHTML = actionFor(it); return; }
      const ps = photosOf(it);
      $detail.innerHTML = `<div class="backdrop" data-close-detail></div>
        <div class="sheet detail" data-id="${it.id}" role="dialog" aria-modal="true">
          <button class="x x-float" data-close-detail aria-label="close">✕</button>
          ${ps.length ? `<div class="gallery">${ps.map((p) => `<img src="${esc(p)}" alt="">`).join('')}</div>
            ${ps.length > 1 ? `<div class="g-dots">${ps.map(() => '<i></i>').join('')}</div>` : ''}` : ''}
          <div class="detail-body">
            <div class="dish-name big">${vegMark(it.is_veg)}<span>${esc(itemName(it))}</span>${it.is_special ? `<span class="sp-tag">★ ${t('specialTag')}</span>` : ''}</div>
            ${itemSub(it) ? `<div class="dish-sub">${esc(itemSub(it))}</div>` : ''}
            ${it.description ? `<p>${esc(it.description)}</p>` : ''}
            <div class="detail-foot"><b class="dish-price">${money(it.price)}</b><div class="dish-act">${actionFor(it)}</div></div>
          </div>
        </div>`;
      const g = $detail.querySelector('.gallery');
      if (g && ps.length > 1) {
        const dots = $detail.querySelectorAll('.g-dots i');
        const mark = () => { const i = Math.round(g.scrollLeft / g.clientWidth); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
        g.addEventListener('scroll', mark, { passive: true }); mark();
      }
    }
    function renderAll() { renderChips(); renderList(); renderBar(); renderSheet(); renderDetail(); }
    function refreshQty() { renderList(); renderBar(); if (open) renderSheet(); if (detail) renderDetail(); }

    root.addEventListener('click', async (e) => {
      const el = e.target;
      const idEl = el.closest('[data-id]');
      const id = idEl && idEl.dataset.id;
      if (el.closest('[data-inc]') && id) {
        const it = byId(id); if (!it || !it.in_stock) return;
        cart[id] = Math.min(50, (cart[id] || 0) + 1); persist(); refreshQty(); return;
      }
      if (el.closest('[data-dec]') && id) { cart[id] = (cart[id] || 0) - 1; if (cart[id] <= 0) delete cart[id]; persist(); refreshQty(); return; }
      if (el.closest('[data-detail]') && id) { detail = id; renderDetail(); return; }
      if (el.closest('[data-close-detail]')) { detail = null; renderDetail(); return; }
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
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (detail) { detail = null; renderDetail(); } else if (open) { open = false; renderSheet(); renderBar(); }
    });
    document.addEventListener('dm:lang', renderAll);

    return {
      setItems(list, photos) {
        if (photos) catPhotos = photos;
        const s = JSON.stringify([list, catPhotos]);
        if (s === sig) return;            // nothing changed — don't disturb the screen
        sig = s;
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
