/* Small dependency-free SVG charts with tap/hover read-outs. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function lin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0 || 1) * (r1 - r0); }; }
  function ticks(lo, hi, n) {
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n)));
    var err = n / span * step;
    if (err <= 0.15) step *= 10; else if (err <= 0.35) step *= 5; else if (err <= 0.75) step *= 2;
    var out = [];
    for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(v);
    return out;
  }
  function short(v) {
    if (v >= 1e5) return '₹' + (v / 1e5).toFixed(v >= 1e6 ? 0 : (v % 1e5 === 0 ? 0 : 1)) + 'L';
    if (v >= 1e3) return '₹' + (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + 'k';
    return '₹' + Math.round(v);
  }
  var tipEl;
  function tip(show, x, y, text) {
    tipEl = tipEl || document.getElementById('tip');
    if (!tipEl) return;
    if (!show) { tipEl.hidden = true; return; }
    tipEl.textContent = text; tipEl.hidden = false;
    tipEl.style.left = Math.max(70, Math.min(window.innerWidth - 70, x)) + 'px'; tipEl.style.top = y + 'px';
  }
  function attachHover(svg, W, H, pts, X, Y, onText, guide, dot) {
    function move(ev) {
      var r = svg.getBoundingClientRect();
      var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
      var best = null, bd = Infinity;
      for (var i = 0; i < pts.length; i++) { var dx = Math.abs(X(pts[i][0]) - cx); if (dx < bd) { bd = dx; best = pts[i]; } }
      if (!best) return;
      var px = X(best[0]), py = Y(best[1]);
      guide.setAttribute('x1', px); guide.setAttribute('x2', px); guide.style.display = '';
      dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.style.display = '';
      tip(true, r.left + px / W * r.width, r.top + py / H * r.height, onText(best));
    }
    function out() { guide.style.display = 'none'; dot.style.display = 'none'; tip(false); }
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', out); svg.addEventListener('touchend', function () { setTimeout(out, 1600); });
  }
  function day(s) { return Date.parse(s + 'T00:00:00Z') / 864e5; }

  /* History line + one-month cone. o: {history, forecast, cls, fmtDate, fmtMoney, labels} */
  function fan(host, o) {
    host.innerHTML = '';
    var W = Math.max(300, Math.round(host.clientWidth || 640)), H = Math.round(Math.max(220, Math.min(320, W * 0.62))), m = { l: 4, r: 84, t: 16, b: 26 };
    var f = o.forecast, t0 = day(f.made_on), t1 = day(f.target);
    var start = t0 - 120;
    var pts = o.history.filter(function (p) { return day(p[0]) >= start; }).map(function (p) { return [day(p[0]), p[1], p[0]]; });
    var lo = Math.min(f.low80, Math.min.apply(null, pts.map(function (p) { return p[1]; })));
    var hi = Math.max(f.high80, Math.max.apply(null, pts.map(function (p) { return p[1]; })));
    var pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
    var X = lin(start, t1, m.l, W - m.r), Y = lin(lo, hi, H - m.b, m.t);
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' }, host);
    var g = el('g', { class: 'grid' }, svg);
    ticks(lo, hi, W < 420 ? 3 : 4).forEach(function (v) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, g);
      var tx = el('text', { x: W - m.r + 6, y: Y(v) + 4 }, g); tx.textContent = short(v);
    });
    // month labels
    var d = new Date((start) * 864e5); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() / 864e5 <= t1) {
      var x = X(d.getTime() / 864e5);
      el('line', { x1: x, x2: x, y1: H - m.b, y2: H - m.b + 4, class: 'xh' }, svg);
      var lt = el('text', { x: x + 2, y: H - 8 }, svg); lt.textContent = o.monthName(d.getUTCMonth());
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
    // cone (log-normal: widen with sqrt of time)
    function cone(z) {
      var top = [], bot = [], n = 24, p0 = o.startPrice, s = o.sigmaMonth;
      for (var i = 0; i <= n; i++) {
        var tt = t0 + (t1 - t0) * i / n, w = s * Math.sqrt(i / n) * z;
        top.push(X(tt) + ',' + Y(p0 * Math.exp(w))); bot.unshift(X(tt) + ',' + Y(p0 * Math.exp(-w)));
      }
      return 'M' + top.join('L') + 'L' + bot.join('L') + 'Z';
    }
    el('path', { d: cone(1.2816), class: 'band80' }, svg);
    el('path', { d: cone(0.6745), class: 'band50' }, svg);
    el('line', { x1: X(t0), x2: X(t1), y1: Y(o.startPrice), y2: Y(o.startPrice), class: 'mid' }, svg);
    // history line, broken at data gaps
    var dstr = '', prev = null;
    pts.forEach(function (p) { dstr += (prev && p[0] - prev[0] <= 6 ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); prev = p; });
    el('path', { d: dstr, class: 'line ' + o.cls }, svg);
    el('circle', { cx: X(t0), cy: Y(o.startPrice), r: 5, class: 'todaydot' }, svg);
    var hl = el('text', { x: W - m.r + 6, y: Y(f.high80) - 2, class: 'lbl-end' }, svg); hl.textContent = o.fmtMoney(f.high80, 100);
    var ll = el('text', { x: W - m.r + 6, y: Y(f.low80) + 12, class: 'lbl-end' }, svg); ll.textContent = o.fmtMoney(f.low80, 100);
    var guide = el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'xh', style: 'display:none' }, svg);
    var dot = el('circle', { r: 5, class: 'todaydot', style: 'display:none' }, svg);
    attachHover(svg, W, H, pts, X, Y, function (p) { return o.fmtDate(p[2]) + ': ' + o.fmtMoney(p[1]); }, guide, dot);
  }

  /* Yearly line. o: {rows:[{fy, v}], cls, fmtMoney} */
  function yearly(host, o) {
    host.innerHTML = '';
    var rows = o.rows.filter(function (r) { return r.v != null; });
    var W = Math.max(300, Math.round(host.clientWidth || 640)), H = Math.round(Math.max(200, Math.min(280, W * 0.55))), m = { l: 4, r: 52, t: 14, b: 26 };
    var X = lin(0, rows.length - 1, m.l, W - m.r);
    var hi = Math.max.apply(null, rows.map(function (r) { return r.v; })) * 1.06;
    var Y = lin(0, hi, H - m.b, m.t);
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' }, host);
    var g = el('g', { class: 'grid' }, svg);
    ticks(0, hi, 4).forEach(function (v) {
      el('line', { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }, g);
      var tx = el('text', { x: W - m.r + 6, y: Y(v) + 4 }, g); tx.textContent = short(v);
    });
    rows.forEach(function (r, i) {
      if (r.fy.slice(0, 4) % (W < 420 ? 20 : 10) === 0) { var tx = el('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }, svg); tx.textContent = r.fy.slice(0, 4); }
    });
    var pts = rows.map(function (r, i) { return [i, r.v, r.fy]; });
    el('path', { d: 'M' + pts.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join('L'), class: 'line ' + o.cls }, svg);
    var last = pts[pts.length - 1];
    el('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4.5, class: 'todaydot' }, svg);
    var guide = el('line', { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: 'xh', style: 'display:none' }, svg);
    var dot = el('circle', { r: 5, class: 'todaydot', style: 'display:none' }, svg);
    attachHover(svg, W, H, pts, X, Y, function (p) { return p[2] + ': ' + o.fmtMoney(p[1]); }, guide, dot);
  }

  window.Charts = { fan: fan, yearly: yearly };
})();
