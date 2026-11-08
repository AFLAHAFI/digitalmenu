// Printing (58 / 80 mm thermal paper through the phone/PC print dialog),
// UPI payment links and WhatsApp bills.
// Tip: on Android, a printer app such as "RawBT" prints these silently.
(function () {
  const { t, esc, money } = DM;
  const paper = () => (localStorage.getItem('dm_paper') === '58' ? 58 : 80);
  const r2 = (x) => Math.round(x * 100) / 100;

  // upi://pay link — opens any UPI app (GPay, PhonePe, Paytm, BHIM)
  DM.upiUrl = function (r, amount, note) {
    if (!r.upi_id) return '';
    const p = new URLSearchParams({ pa: r.upi_id, pn: r.name.slice(0, 40), am: Number(amount).toFixed(2), cu: 'INR' });
    if (note) p.set('tn', note.slice(0, 40));
    return 'upi://pay?' + p.toString().replace(/\+/g, '%20');
  };
  DM.qrSvg = function (text, cell = 4) {
    if (!text || typeof qrcode === 'undefined') return '';
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
  };

  // merge the same dish across orders
  DM.mergeLines = function (orders) {
    const m = new Map();
    orders.forEach((o) => o.items.forEach((i) => {
      const k = DM.lineKey(i);
      if (!m.has(k)) m.set(k, { ...i, qty: 0 });
      m.get(k).qty += i.qty;
    }));
    return [...m.values()];
  };

  // same maths as pay_bill() in the database (for showing before paying)
  DM.billMaths = function (r, subtotal, discount) {
    const sub = r2(subtotal), disc = r2(Math.min(Math.max(0, discount || 0), sub));
    const taxable = sub - disc, rate = Number(r.gst_rate) || 0;
    let gst = 0, total = taxable;
    if (rate > 0) {
      if (r.gst_inclusive) gst = r2(taxable - taxable / (1 + rate / 100));
      else { gst = r2(taxable * rate / 100); total = taxable + gst; }
    }
    const rounded = Math.round(total);
    return { subtotal: sub, discount: disc, gst_rate: rate, gst_inclusive: !!r.gst_inclusive, gst_amount: gst, round_off: r2(rounded - total), total: rounded };
  };

  function doPrint(html) {
    const old = document.getElementById('print-area'); if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'print-area';
    el.className = 'paper-' + paper();
    el.innerHTML = html;
    document.body.appendChild(el);
    document.body.classList.add('printing');
    let cleaned = false;
    const done = () => { if (cleaned) return; cleaned = true; document.body.classList.remove('printing'); el.remove(); };
    window.addEventListener('afterprint', done, { once: true });
    setTimeout(() => { window.print(); setTimeout(done, 1500); }, 60);   // let images/QR render first
  }

  const head = (r) => `<div class="c b big">${esc(r.name)}</div>${r.name_ml ? `<div class="c">${esc(r.name_ml)}</div>` : ''}${r.gstin ? `<div class="c">GSTIN: ${esc(r.gstin)}</div>` : ''}`;
  const when = (iso) => new Date(iso || Date.now()).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
  const where = (o) => (o.order_type === 'parcel' ? `📦 ${t('parcel')}${o.customer_name ? ' · ' + esc(o.customer_name) : ''}` : `${t('table')} ${o.table_no}`);

  // Kitchen order ticket
  DM.printKOT = function (r, o) {
    doPrint(`<div class="c b">${esc(r.name)} — KOT</div><hr>
      <div class="r"><span class="b huge">${o.order_type === 'parcel' ? '📦 ' + t('parcel').toUpperCase() : t('table') + ' ' + o.table_no}</span><span class="b">#${o.order_no}</span></div>
      ${o.customer_name ? `<div>${esc(o.customer_name)}</div>` : ''}
      <div>${when(o.created_at)}</div><hr>
      ${o.items.filter((i) => i.id !== 'parcel').map((i) => `<div class="kl"><b>${i.qty} ×</b> ${esc(DM.lineName(i))}${i.name_ml ? `<div class="sm">${esc(DM.lineName(i, true))}</div>` : ''}</div>`).join('')}
      ${o.note ? `<hr><div class="b">NOTE: ${esc(o.note)}</div>` : ''}<hr>`);
  };

  // Customer bill. bill = row from pay_bill() or a preview from billMaths()
  DM.printBill = function (r, orders, bill) {
    const lines = DM.mergeLines(orders);
    const b = bill || DM.billMaths(r, orders.reduce((a, o) => a + Number(o.total), 0), 0);
    const o0 = orders[0] || {};
    const half = r2(b.gst_amount / 2);
    const upi = r.upi_id && !bill ? DM.upiUrl(r, b.total, (b.bill_no ? 'Bill ' + b.bill_no : t('table') + ' ' + o0.table_no)) : '';
    doPrint(`${head(r)}<hr>
      <div class="r"><span>${bill && bill.bill_no ? t('billNo') + ' #' + bill.bill_no : ''}</span><span>${when(bill && bill.created_at)}</span></div>
      <div>${where(o0)}</div><hr>
      ${lines.map((i) => `<div class="r"><span>${i.qty} × ${esc(DM.lineName(i, true))}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
      <hr><div class="r"><span>${t('subtotal')}</span><span>${money(b.subtotal)}</span></div>
      ${b.discount > 0 ? `<div class="r"><span>${t('discount')}${bill && bill.discount_note ? ' (' + esc(bill.discount_note) + ')' : ''}</span><span>− ${money(b.discount)}</span></div>` : ''}
      ${b.gst_amount > 0 ? `<div class="r"><span>${t('cgst')} ${b.gst_rate / 2}%${b.gst_inclusive ? ' (incl.)' : ''}</span><span>${money(half)}</span></div>
        <div class="r"><span>${t('sgst')} ${b.gst_rate / 2}%${b.gst_inclusive ? ' (incl.)' : ''}</span><span>${money(r2(b.gst_amount - half))}</span></div>` : ''}
      ${b.round_off ? `<div class="r"><span>${t('roundOff')}</span><span>${b.round_off > 0 ? '+' : '−'} ${money(Math.abs(b.round_off))}</span></div>` : ''}
      <hr><div class="r b big"><span>${t('grandTotal')}</span><span>${money(b.total)}</span></div>
      ${bill ? `<div class="r"><span>${bill.cash_amount > 0 ? t('cash') + ' ' + money(bill.cash_amount) : ''}</span><span>${bill.upi_amount > 0 ? 'UPI ' + money(bill.upi_amount) : ''}</span></div>` : ''}
      ${upi ? `<hr><div class="c">${t('scanUpi')}</div><div class="qr">${DM.qrSvg(upi, 3)}</div><div class="c">${esc(r.upi_id)}</div>` : ''}
      <hr><div class="c">${esc(r.bill_footer || t('thanks'))}</div>`);
  };

  // WhatsApp: opens the chat with the bill text filled in
  DM.whatsappBill = function (r, orders, bill, phone) {
    const lines = DM.mergeLines(orders);
    const o0 = orders[0] || {};
    const txt = [
      `*${r.name}*`, bill.bill_no ? `${t('billNo')} #${bill.bill_no} · ${when(bill.created_at)}` : when(bill.created_at),
      o0.order_type === 'parcel' ? t('parcel') : `${t('table')} ${o0.table_no}`, '',
      ...lines.map((i) => `${i.qty} x ${DM.lineName(i, true)} — ${money(i.price * i.qty)}`), '',
      `${t('subtotal')}: ${money(bill.subtotal)}`,
      bill.discount > 0 ? `${t('discount')}: -${money(bill.discount)}` : null,
      bill.gst_amount > 0 ? `GST ${bill.gst_rate}%: ${money(bill.gst_amount)}` : null,
      `*${t('grandTotal')}: ${money(bill.total)}*`, '', r.bill_footer || t('thanks'),
    ].filter((x) => x !== null).join('\n');
    let num = String(phone || bill.customer_phone || '').replace(/[^0-9]/g, '');
    if (num.length === 10) num = '91' + num;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(txt)}`, '_blank');
  };
})();
