// Tiny dependency-free SVG charts for the reports screen.
(function () {
  const { esc } = DM;
  const nice = (max) => {
    if (max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max))), n = max / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  };
  const short = (v) => (v >= 100000 ? (v / 100000).toFixed(1).replace(/\.0$/, '') + 'L' : v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(Math.round(v)));

  // vertical bars: data = [{ label, value, title }]
  DM.columnChart = function (data, { height = 240, fmt = short } = {}) {
    if (!data.length) return '';
    const W = Math.max(720, data.length * 30), H = height, padL = 44, padB = 26, padT = 10;
    const max = nice(Math.max(...data.map((d) => d.value)));
    const bw = (W - padL - 8) / data.length;
    const y = (v) => H - padB - (v / max) * (H - padB - padT);
    const ticks = [0, max / 2, max];
    const every = Math.ceil(data.length / 12);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img">
      ${ticks.map((v) => `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${padL - 6}" y="${y(v) + 4}" class="ax" text-anchor="end">${fmt(v)}</text>`).join('')}
      ${data.map((d, i) => {
        const x = padL + i * bw + bw * 0.15, h = Math.max(0, H - padB - y(d.value));
        return `<g><title>${esc(d.title || d.label + ': ' + d.value)}</title>
          <rect x="${x}" y="${y(d.value)}" width="${bw * 0.7}" height="${h}" rx="3" class="bar"/>
          ${i % every === 0 ? `<text x="${x + bw * 0.35}" y="${H - 8}" class="ax" text-anchor="middle">${esc(d.label)}</text>` : ''}</g>`;
      }).join('')}
    </svg>`;
  };

  // horizontal bars as HTML (wraps Malayalam names nicely)
  DM.barList = function (data, { fmt = (v) => v } = {}) {
    if (!data.length) return '';
    const max = Math.max(...data.map((d) => d.value)) || 1;
    return `<div class="barlist">${data.map((d) => `<div class="bl-row">
        <div class="bl-label">${esc(d.label)}${d.sub ? `<small>${esc(d.sub)}</small>` : ''}</div>
        <div class="bl-track"><div class="bl-fill" style="width:${(d.value / max) * 100}%"></div></div>
        <div class="bl-val">${esc(fmt(d.value, d))}</div></div>`).join('')}</div>`;
  };

  // two-part split bar (cash vs UPI)
  DM.splitBar = function (a, b, la, lb, fmt) {
    const tot = a + b || 1;
    return `<div class="split"><div class="sp-a" style="width:${(a / tot) * 100}%"></div><div class="sp-b" style="width:${(b / tot) * 100}%"></div></div>
      <div class="split-leg"><span><i class="dot a"></i>${esc(la)} ${fmt(a)} (${Math.round((a / tot) * 100)}%)</span>
      <span><i class="dot b"></i>${esc(lb)} ${fmt(b)} (${Math.round((b / tot) * 100)}%)</span></div>`;
  };
})();
