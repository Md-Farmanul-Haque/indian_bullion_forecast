/* Small dependency-free SVG charts with touch/hover read-outs. */
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
    if (v >= 1e5) return '₹' + (+(v / 1e5).toFixed(2)) + 'L';
    if (v >= 1e3) return '₹' + (+(v / 1e3).toFixed(1)) + 'k';
    return '₹' + Math.round(v);
  }
  function day(s) { return Date.parse(s + 'T00:00:00Z') / 864e5; }
  function iso(d) { return new Date(d * 864e5).toISOString().slice(0, 10); }
  var tipEl;
  function tip(show, x, y, text) {
    tipEl = tipEl || document.getElementById('tip');
    if (!tipEl) return;
    if (!show) { tipEl.hidden = true; return; }
    tipEl.textContent = text; tipEl.hidden = false;
    tipEl.style.left = Math.max(90, Math.min(window.innerWidth - 90, x)) + 'px'; tipEl.style.top = Math.max(8, y) + 'px';
  }
  function frame(host, ratio, minH, maxH) {
    host.innerHTML = '';
    var W = Math.max(300, Math.round(host.clientWidth || 640));
    var H = Math.round(Math.max(minH, Math.min(maxH, W * ratio)));
    return { W: W, H: H, svg: el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'aria-hidden': 'true' }, host) };
  }
  function yAxis(svg, lo, hi, Y, x0, x1, W) {
    var g = el('g', { class: 'grid' }, svg);
    ticks(lo, hi, W < 420 ? 3 : 4).forEach(function (v) {
      el('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v) }, g);
      var tx = el('text', { x: x1 + 6, y: Y(v) + 4 }, g); tx.textContent = short(v);
    });
  }
  function xAxis(svg, a, b, X, H, mb, monthName) {
    var span = b - a, d, x, t;
    if (span <= 75) {               // weekly ticks: "16 Nov"
      for (var k = Math.ceil(a / 7) * 7 + 4; k <= b; k += 7) {
        x = X(k); d = new Date(k * 864e5);
        el('line', { x1: x, x2: x, y1: H - mb, y2: H - mb + 4, class: 'xh' }, svg);
        t = el('text', { x: x, y: H - 8, 'text-anchor': 'middle' }, svg); t.textContent = d.getUTCDate() + ' ' + monthName(d.getUTCMonth());
      }
      return;
    }
    var step = span > 300 ? 2 : 1;
    d = new Date(a * 864e5); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
    while (d.getTime() / 864e5 <= b) {
      x = X(d.getTime() / 864e5);
      el('line', { x1: x, x2: x, y1: H - mb, y2: H - mb + 4, class: 'xh' }, svg);
      t = el('text', { x: x + 2, y: H - 8 }, svg); t.textContent = monthName(d.getUTCMonth()) + (d.getUTCMonth() === 0 ? ' ' + d.getUTCFullYear() : '');
      d.setUTCMonth(d.getUTCMonth() + step);
    }
  }
  function pathWithGaps(pts, X, Y) {
    var s = '', prev = null;
    pts.forEach(function (p) { s += (prev && p[0] - prev[0] <= 6 ? 'L' : 'M') + X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); prev = p; });
    return s;
  }
  function hover(svg, W, H, m, onMove) {
    var guide = el('line', { y1: m.t, y2: H - m.b, class: 'xh guide', style: 'display:none' }, svg);
    var d1 = el('circle', { r: 5, class: 'todaydot', style: 'display:none' }, svg);
    var d2 = el('circle', { r: 5, class: 'todaydot', style: 'display:none' }, svg);
    function move(ev) {
      var r = svg.getBoundingClientRect();
      var cx = ((ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left) / r.width * W;
      var res = onMove(Math.max(m.l, Math.min(W - m.r, cx)));
      if (!res) return out();
      guide.setAttribute('x1', res.x); guide.setAttribute('x2', res.x); guide.style.display = '';
      d1.setAttribute('cx', res.x); d1.setAttribute('cy', res.y1); d1.style.display = '';
      if (res.y2 != null) { d2.setAttribute('cx', res.x); d2.setAttribute('cy', res.y2); d2.style.display = ''; } else d2.style.display = 'none';
      tip(true, r.left + res.x / W * r.width, r.top + Math.min(res.y1, res.y2 == null ? res.y1 : res.y2) / H * r.height - 10, res.text);
    }
    function out() { guide.style.display = 'none'; d1.style.display = 'none'; d2.style.display = 'none'; tip(false); }
    svg.addEventListener('pointermove', move); svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', out); svg.addEventListener('touchend', function () { setTimeout(out, 2000); });
  }

  /* Price line (with gaps) and, if o.range is given, the cone of likely prices ahead.
     o: {history:[[iso, price]], fromDay, range:{start, price, sigma, trading, days, low80, high80}, cls, fmtDate, fmtMoney, monthName, tipRange} */
  function priceChart(host, o) {
    var f = frame(host, 0.6, 220, 330), W = f.W, H = f.H, svg = f.svg;
    var m = { l: 4, r: 84, t: 16, b: 26 };
    var R = o.range, t0 = R ? day(R.start) : null, t1 = R ? t0 + R.days : null;
    var lastHist = day(o.history[o.history.length - 1][0]);
    var a = o.fromDay, b = R ? t1 : lastHist;
    var pts = o.history.filter(function (p) { return day(p[0]) >= a; }).map(function (p) { return [day(p[0]), p[1], p[0]]; });
    if (!pts.length) return;
    var vals = pts.map(function (p) { return p[1]; });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    if (R) { lo = Math.min(lo, R.low80); hi = Math.max(hi, R.high80); }
    var pad = (hi - lo) * 0.08 || hi * 0.02; lo -= pad; hi += pad;
    var X = lin(a, b, m.l, W - m.r), Y = lin(lo, hi, H - m.b, m.t);
    yAxis(svg, lo, hi, Y, m.l, W - m.r, W);
    xAxis(svg, a, b, X, H, m.b, o.monthName);
    function band(z, tt) { return R.sigma * Math.sqrt(R.trading * Math.max(0, (tt - t0) / R.days)) * z; }
    if (R) {
      var cone = function (z) {
        var top = [], bot = [], n = 30;
        for (var i = 0; i <= n; i++) {
          var tt = t0 + (t1 - t0) * i / n, w = band(z, tt);
          top.push(X(tt).toFixed(1) + ',' + Y(R.price * Math.exp(w)).toFixed(1)); bot.unshift(X(tt).toFixed(1) + ',' + Y(R.price * Math.exp(-w)).toFixed(1));
        }
        return 'M' + top.join('L') + 'L' + bot.join('L') + 'Z';
      };
      el('path', { d: cone(1.2816), class: 'band80' }, svg);
      el('path', { d: cone(0.6745), class: 'band50' }, svg);
      el('line', { x1: X(t0), x2: X(t1), y1: Y(R.price), y2: Y(R.price), class: 'mid' }, svg);
    }
    el('path', { d: pathWithGaps(pts, X, Y), class: 'line ' + o.cls }, svg);
    if (R) {
      el('circle', { cx: X(t0), cy: Y(R.price), r: 5, class: 'todaydot' }, svg);
      var hl = el('text', { x: W - m.r + 6, y: Y(R.high80) - 2, class: 'lbl-end' }, svg); hl.textContent = o.fmtMoney(R.high80, 100);
      var ll = el('text', { x: W - m.r + 6, y: Y(R.low80) + 12, class: 'lbl-end' }, svg); ll.textContent = o.fmtMoney(R.low80, 100);
    }
    hover(svg, W, H, m, function (cx) {
      var tx = a + (cx - m.l) / (W - m.r - m.l) * (b - a);
      if (R && tx > t0) {
        var td = Math.round(tx), w = band(1.2816, td);
        var lo8 = R.price * Math.exp(-w), hi8 = R.price * Math.exp(w);
        return { x: X(td), y1: Y(hi8), y2: Y(lo8), text: o.tipRange(iso(td), o.fmtMoney(lo8, 100), o.fmtMoney(hi8, 100)) };
      }
      var best = null, bd = Infinity;
      pts.forEach(function (p) { var dd = Math.abs(p[0] - tx); if (dd < bd) { bd = dd; best = p; } });
      return best && { x: X(best[0]), y1: Y(best[1]), text: o.fmtDate(best[2]) + ': ' + o.fmtMoney(best[1]) };
    });
  }

  /* Yearly line. o: {rows:[{fy, v}], cls, fmtMoney} */
  function yearly(host, o) {
    var rows = o.rows.filter(function (r) { return r.v != null; });
    var f = frame(host, 0.55, 210, 300), W = f.W, H = f.H, svg = f.svg;
    var m = { l: 4, r: 56, t: 14, b: 26 };
    var X = lin(0, rows.length - 1, m.l, W - m.r);
    var hi = Math.max.apply(null, rows.map(function (r) { return r.v; })) * 1.06;
    var Y = lin(0, hi, H - m.b, m.t);
    yAxis(svg, 0, hi, Y, m.l, W - m.r, W);
    rows.forEach(function (r, i) {
      if (r.fy.slice(0, 4) % (W < 420 ? 20 : 10) === 0) { var tx = el('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }, svg); tx.textContent = r.fy.slice(0, 4); }
    });
    var pts = rows.map(function (r, i) { return [i, r.v, r.fy]; });
    el('path', { d: 'M' + pts.map(function (p) { return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1); }).join('L'), class: 'line ' + o.cls }, svg);
    var last = pts[pts.length - 1];
    el('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4.5, class: 'todaydot' }, svg);
    hover(svg, W, H, m, function (cx) {
      var i = Math.round((cx - m.l) / (W - m.r - m.l) * (rows.length - 1)), p = pts[Math.max(0, Math.min(pts.length - 1, i))];
      return { x: X(p[0]), y1: Y(p[1]), text: p[2] + ': ' + o.fmtMoney(p[1]) };
    });
  }

  window.Charts = { price: priceChart, yearly: yearly, day: day };
})();
