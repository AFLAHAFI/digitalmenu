// Photo picker with crop: drag to move, slider/pinch to zoom, fixed shape.
// Always returns a small JPEG (phone photos are often 4–8 MB).
(function () {
  const { t } = DM;

  // DM.pickPhoto({ aspect: 4/3, maxW: 1000 }) -> Promise<Blob|null>
  DM.pickPhoto = function (opts = {}) {
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        DM.cropImage(f, opts).then(resolve, (e) => { DM.toast(DM.errMsg(e), 'bad'); resolve(null); });
      };
      inp.click();
    });
  };

  DM.cropImage = function (file, { aspect = 4 / 3, maxW = 1000 } = {}) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read photo')); };
      img.onload = () => {
        const wrap = document.createElement('div');
        wrap.className = 'crop-wrap';
        wrap.innerHTML = `<div class="crop-box"><canvas></canvas></div>
          <p class="crop-tip">${t('crop')}</p>
          <input type="range" min="1" max="4" step="0.01" value="1" class="crop-zoom" aria-label="zoom">
          <div class="crop-acts"><button class="btn" data-x>${t('close')}</button><button class="btn primary big" data-use>${t('usePhoto')}</button></div>`;
        document.body.appendChild(wrap);
        document.body.classList.add('noscroll');
        const cv = wrap.querySelector('canvas'), ctx = cv.getContext('2d');
        const zoomIn = wrap.querySelector('.crop-zoom');
        const W = Math.min(window.innerWidth - 32, 520), H = Math.round(W / aspect);
        const dpr = window.devicePixelRatio || 1;
        cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
        const base = Math.max(W / img.width, H / img.height);   // "cover" scale
        let zoom = 1, cx = img.width / 2, cy = img.height / 2;   // image point at the centre

        const clamp = () => {
          const s = base * zoom, hw = W / 2 / s, hh = H / 2 / s;
          cx = Math.min(Math.max(cx, hw), img.width - hw);
          cy = Math.min(Math.max(cy, hh), img.height - hh);
        };
        const draw = () => {
          clamp();
          const s = base * zoom;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
          ctx.drawImage(img, W / 2 - cx * s, H / 2 - cy * s, img.width * s, img.height * s);
        };
        draw();

        // drag + pinch with pointer events
        const pts = new Map(); let pinch0 = null;
        cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
        cv.addEventListener('pointermove', (e) => {
          if (!pts.has(e.pointerId)) return;
          const prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (pts.size === 2) {
            const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinch0) { zoom = Math.min(4, Math.max(1, zoom * d / pinch0)); zoomIn.value = zoom; }
            pinch0 = d;
          } else {
            const s = base * zoom; cx -= (e.clientX - prev.x) / s; cy -= (e.clientY - prev.y) / s;
          }
          draw();
        });
        const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = null; };
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
        cv.addEventListener('wheel', (e) => { e.preventDefault(); zoom = Math.min(4, Math.max(1, zoom * (e.deltaY < 0 ? 1.08 : 0.92))); zoomIn.value = zoom; draw(); }, { passive: false });
        zoomIn.addEventListener('input', () => { zoom = Number(zoomIn.value); draw(); });

        const done = (blob) => { wrap.remove(); document.body.classList.remove('noscroll'); URL.revokeObjectURL(url); resolve(blob); };
        wrap.querySelector('[data-x]').onclick = () => done(null);
        wrap.querySelector('[data-use]').onclick = () => {
          const s = base * zoom;
          const sw = W / s, sh = H / s;                       // source rect in image pixels
          const outW = Math.round(Math.min(maxW, sw)), outH = Math.round(outW / aspect);
          const out = document.createElement('canvas'); out.width = outW; out.height = outH;
          const o = out.getContext('2d');
          o.imageSmoothingQuality = 'high';
          o.drawImage(img, cx - sw / 2, cy - sh / 2, sw, sh, 0, 0, outW, outH);
          out.toBlob((b) => (b ? done(b) : (wrap.remove(), reject(new Error('photo error')))), 'image/jpeg', 0.82);
        };
      };
      img.src = url;
    });
  };
})();
