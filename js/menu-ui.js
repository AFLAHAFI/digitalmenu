// Menu + cart component, shared by the customer menu and waiter mode.
// Dishes may have sizes ("variants", choose one) and add-ons (choose any).
(function () {
  const { t, esc, money, itemName, itemSub, vegMark } = DM;

  DM.MenuUI = function (root, opts) {
    // opts: { cartKey, onSend(lines, note) -> Promise<bool>, sheetTitle(), categoryPhotos, compact }
    const cartKey = opts.cartKey || 'dm_cart';
    let items = [], sig = '';
    let cart = load();                 // { key: qty }  key = id  or  id|variant|addon.addon
    let cat = 'all', q = '', note = '', open = false, sending = false, detail = null;
    let cfg = null;                    // options being chosen in the detail sheet
    let catPhotos = opts.categoryPhotos || {};

    function load() { try { return JSON.parse(sessionStorage.getItem(cartKey)) || {}; } catch (e) { return {}; } }
    function persist() { try { sessionStorage.setItem(cartKey, JSON.stringify(cart)); } catch (e) { /* ignore */ } }
    const byId = (id) => items.find((i) => i.id === id);
    const hasOpts = (it) => (it.variants && it.variants.length) || (it.addons && it.addons.length);
    const makeKey = (id, v, adds) => (v === undefined && !(adds && adds.length) ? id : `${id}|${v ?? -1}|${(adds || []).slice().sort((a, b) => a - b).join('.')}`);
    const parseKey = (k) => {
      const [id, v, a] = k.split('|');
      return { id, variant: v === undefined || v === '-1' ? undefined : Number(v), addons: a ? a.split('.').map(Number) : [] };
    };
    const unitPrice = (it, v, adds) => {
      let p = it.variants && it.variants.length && v !== undefined ? Number(it.variants[v].price) : Number(it.price);
      (adds || []).forEach((k) => { p += Number(it.addons[k].price); });
      return p;
    };
    const keyName = (k) => {
      const c = parseKey(k), it = byId(c.id);
      return DM.lineName({ name_en: it.name_en, name_ml: it.name_ml,
        variant_en: c.variant !== undefined ? it.variants[c.variant].name_en : null,
        variant_ml: c.variant !== undefined ? it.variants[c.variant].name_ml : null,
        addons: c.addons.map((x) => it.addons[x]) });
    };
    const keyPrice = (k) => { const c = parseKey(k); return unitPrice(byId(c.id), c.variant, c.addons); };
    const qtyOfItem = (id) => Object.entries(cart).reduce((s, [k, n]) => s + (parseKey(k).id === id ? n : 0), 0);
    const roomFor = (it) => (it.stock_qty === null || it.stock_qty === undefined ? 50 : it.stock_qty - qtyOfItem(it.id));
    const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
    const total = () => Object.entries(cart).reduce((s, [k, n]) => s + (byId(parseKey(k).id) ? keyPrice(k) * n : 0), 0);
    const cats = () => [...new Set(items.map((i) => i.category))];
    const photosOf = (it) => [it.photo_url, ...(it.photos || [])].filter(Boolean);
    const priceLabel = (it) => {
      if (!(it.variants && it.variants.length)) return money(it.price);
      const min = Math.min(...it.variants.map((v) => Number(v.price)));
      return DM.lang === 'ml' ? `${money(min)} ${t('fromPrice')}` : `${t('fromPrice')} ${money(min)}`;
    };
    const lowTag = (it) => (it.in_stock && it.stock_qty !== null && it.stock_qty !== undefined && it.stock_qty <= 5
      ? `<span class="low-tag">${t('onlyLeft', { n: it.stock_qty })}</span>` : '');

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
      if (!it.in_stock) return `<span class="out-tag">${t('out')}</span>`;
      if (hasOpts(it)) {
        const n = qtyOfItem(it.id);
        return `<button class="add-btn" data-config>${t('add')}${n ? ` <span class="cnt">${n}</span>` : ''}</button>`;
      }
      const n = cart[it.id] || 0;
      return n ? stepper(n) : `<button class="add-btn" data-inc>${t('add')}</button>`;
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
            <div class="dish-price">${priceLabel(it)} ${lowTag(it)}</div>
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
      const lines = Object.entries(cart).filter(([k]) => byId(parseKey(k).id));
      const still = $sheet.querySelector('.sheet') ? 'still' : '';
      $sheet.innerHTML = `<div class="backdrop" data-close></div>
        <div class="sheet ${still}" role="dialog" aria-modal="true">
          <div class="sheet-h"><h3>${esc(opts.sheetTitle ? opts.sheetTitle() : t('yourOrder'))}</h3><button class="x" data-close aria-label="close">✕</button></div>
          ${lines.length ? lines.map(([k, n]) => { const it = byId(parseKey(k).id); return `
            <div class="line" data-key="${esc(k)}">
              <div class="line-name">${vegMark(it.is_veg)}<span>${esc(keyName(k))}<small>${money(keyPrice(k))}</small></span></div>
              ${stepper(n)}
              <div class="line-amt">${money(keyPrice(k) * n)}</div>
            </div>`; }).join('') : `<p class="muted center pad">${t('emptyCart')}</p>`}
          <textarea class="note" rows="2" maxlength="200" placeholder="${esc(t('note'))}">${esc(note)}</textarea>
          <div class="sheet-total"><span>${t('total')}</span><b>${money(total())}</b></div>
          <button class="btn primary big block" data-send ${!lines.length || sending ? 'disabled' : ''}>${sending ? t('sending') : t('send')}</button>
        </div>`;
    }
    function optionsHTML(it) {
      const vs = it.variants || [], as = it.addons || [];
      const price = unitPrice(it, vs.length ? cfg.v : undefined, [...cfg.adds]);
      return `${vs.length ? `<div class="opt-h">${t('chooseSize')}</div><div class="opts">${vs.map((v, k) => `
          <label class="opt ${cfg.v === k ? 'on' : ''}"><input type="radio" name="dmv" data-v="${k}" ${cfg.v === k ? 'checked' : ''}>
            <span>${esc(DM.lang === 'ml' ? v.name_ml || v.name_en : v.name_en)}</span><b>${money(v.price)}</b></label>`).join('')}</div>` : ''}
        ${as.length ? `<div class="opt-h">${t('addons')}</div><div class="opts">${as.map((a, k) => `
          <label class="opt ${cfg.adds.has(k) ? 'on' : ''}"><input type="checkbox" data-a="${k}" ${cfg.adds.has(k) ? 'checked' : ''}>
            <span>${esc(DM.lang === 'ml' ? a.name_ml || a.name_en : a.name_en)}</span><b>+${money(a.price)}</b></label>`).join('')}</div>` : ''}
        <div class="detail-foot">
          <div class="stepper"><button data-cq="-1" aria-label="-">−</button><b>${cfg.qty}</b><button data-cq="1" aria-label="+">+</button></div>
          <button class="btn primary big" data-add-config>${t('addToOrder')} · ${money(price * cfg.qty)}</button>
        </div>`;
    }
    function renderDetail() {
      const it = detail && byId(detail);
      if (!it) { detail = null; cfg = null; $detail.innerHTML = ''; lockScroll(); return; }
      lockScroll();
      const cur = $detail.querySelector('.sheet.detail');
      if (cur && cur.dataset.id === it.id) {
        if (cfg) cur.querySelector('.detail-opts').innerHTML = optionsHTML(it);
        else cur.querySelector('.detail-foot .dish-act').innerHTML = actionFor(it);
        return;
      }
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
            ${lowTag(it)}
            ${cfg ? `<div class="detail-opts">${optionsHTML(it)}</div>`
              : `<div class="detail-foot"><b class="dish-price">${priceLabel(it)}</b><div class="dish-act">${actionFor(it)}</div></div>`}
          </div>
        </div>`;
      const g = $detail.querySelector('.gallery');
      if (g && ps.length > 1) {
        const dots = $detail.querySelectorAll('.g-dots i');
        const mark = () => { const i = Math.round(g.scrollLeft / g.clientWidth); dots.forEach((d, k) => d.classList.toggle('on', k === i)); };
        g.addEventListener('scroll', mark, { passive: true }); mark();
      }
    }
    function openDetail(id) {
      const it = byId(id); if (!it) return;
      detail = id;
      cfg = hasOpts(it) && it.in_stock ? { v: (it.variants && it.variants.length) ? 0 : undefined, adds: new Set(), qty: 1 } : null;
      $detail.innerHTML = ''; renderDetail();
    }
    function renderAll() { renderChips(); renderList(); renderBar(); renderSheet(); if (detail) { $detail.innerHTML = ''; renderDetail(); } }
    function refreshQty() { renderList(); renderBar(); if (open) renderSheet(); if (detail) renderDetail(); }
    function addKey(k, n) {
      const it = byId(parseKey(k).id);
      if (!it || !it.in_stock) return false;
      if (roomFor(it) < n) { DM.toast(t('onlyLeft', { n: it.stock_qty }), 'warn'); return false; }
      cart[k] = Math.min(50, (cart[k] || 0) + n); persist(); return true;
    }

    root.addEventListener('click', async (e) => {
      const el = e.target;
      const keyEl = el.closest('[data-key]');
      const idEl = el.closest('[data-id]');
      const k = keyEl ? keyEl.dataset.key : idEl ? idEl.dataset.id : null;
      if (el.closest('[data-inc]') && k) { addKey(k, 1); refreshQty(); return; }
      if (el.closest('[data-dec]') && k) { cart[k] = (cart[k] || 0) - 1; if (cart[k] <= 0) delete cart[k]; persist(); refreshQty(); return; }
      if (el.closest('[data-config]') && idEl) { openDetail(idEl.dataset.id); return; }
      if (el.closest('[data-detail]') && idEl) { openDetail(idEl.dataset.id); return; }
      if (el.closest('[data-close-detail]')) { detail = null; cfg = null; renderDetail(); return; }
      const cq = el.closest('[data-cq]');
      if (cq && cfg) { cfg.qty = Math.min(50, Math.max(1, cfg.qty + Number(cq.dataset.cq))); renderDetail(); return; }
      if (el.closest('[data-add-config]') && cfg && detail) {
        const it = byId(detail);
        const key = makeKey(it.id, (it.variants && it.variants.length) ? cfg.v : undefined, [...cfg.adds]);
        if (addKey(key, cfg.qty)) { DM.toast('✓ ' + keyName(key), 'good'); detail = null; cfg = null; renderDetail(); refreshQty(); }
        return;
      }
      const c = el.closest('[data-cat]');
      if (c) { cat = c.dataset.cat; renderChips(); renderList(); window.scrollTo({ top: 0 }); return; }
      if (el.closest('[data-open]')) { open = true; renderBar(); renderSheet(); return; }
      if (el.closest('[data-close]')) { open = false; renderSheet(); renderBar(); return; }
      if (el.closest('[data-send]') && !sending) {
        const lines = Object.entries(cart).filter(([key]) => byId(parseKey(key).id)).map(([key, qty]) => {
          const p = parseKey(key); const line = { id: p.id, qty };
          if (p.variant !== undefined) line.variant = p.variant;
          if (p.addons.length) line.addons = p.addons;
          return line;
        });
        if (!lines.length) return;
        sending = true; renderSheet();
        let okSent = false;
        try { okSent = await opts.onSend(lines, note.trim()); } catch (err) { DM.toast(DM.errMsg(err), 'bad'); }
        sending = false;
        if (okSent) { cart = {}; note = ''; open = false; persist(); }
        renderAll();
      }
    });
    root.addEventListener('change', (e) => {
      if (!cfg) return;
      const v = e.target.closest('[data-v]'); if (v) { cfg.v = Number(v.dataset.v); renderDetail(); return; }
      const a = e.target.closest('[data-a]'); if (a) { const n = Number(a.dataset.a); if (a.checked) cfg.adds.add(n); else cfg.adds.delete(n); renderDetail(); }
    });
    root.addEventListener('input', (e) => {
      if (e.target === $search) { q = e.target.value; renderList(); }
      if (e.target.classList.contains('note')) note = e.target.value;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (detail) { detail = null; cfg = null; renderDetail(); } else if (open) { open = false; renderSheet(); renderBar(); }
    });
    document.addEventListener('dm:lang', renderAll);

    return {
      setItems(list, photos) {
        if (photos) catPhotos = photos;
        const s = JSON.stringify([list, catPhotos]);
        if (s === sig) return;            // nothing changed — don't disturb the screen
        sig = s;
        items = list;
        for (const key of Object.keys(cart)) {
          const p = parseKey(key), it = byId(p.id);
          const badOpt = it && ((it.variants && it.variants.length ? !(p.variant >= 0 && p.variant < it.variants.length) : p.variant !== undefined)
            || p.addons.some((x) => !(it.addons && x >= 0 && x < it.addons.length)));
          if (!it || !it.in_stock || badOpt) { if (it && !it.in_stock) DM.toast(itemName(it) + ' ' + t('outNow'), 'warn'); delete cart[key]; }
        }
        if (detail && !byId(detail)) { detail = null; cfg = null; }
        if (cat !== 'all' && !cats().includes(cat)) cat = 'all';
        persist(); renderAll();
      },
      clear() { cart = {}; note = ''; open = false; persist(); renderAll(); },
      count,
    };
  };
})();
