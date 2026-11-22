(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var DATA = null;
  var S = { metal: 'gold22', purity: null, mode: 'pct', h: 2, range: '6m' };
  var METAL_NAME = { gold22: 'm_gold22', gold24: 'm_gold24', silver: 'm_silver' };
  var DEFAULT_PURITY = { gold22: 'g916', gold24: 'g999', silver: 's999' };

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function t(key, vars) {
    var s = I18N.en[key] || key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function fmtDate(iso, opt) {
    var p = iso.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
    var s = (+p[2]) + ' ' + EN_MONTHS[+p[1] - 1] + (opt === 'short' ? '' : ' ' + p[0]);
    return opt === 'day' ? EN_DAYS[d.getUTCDay()] + ' ' + s : s;
  }
  function monthName(i) { return EN_MONTHS[i]; }
  function money(x, round) { return Calc.inr(x, round ? { round: round } : null); }
  function pct(x, dp) {
    if (x == null || !isFinite(x)) return '–';
    var v = Math.abs(x).toFixed(dp == null ? 1 : dp);
    return (x > 0.05 ? '+' : x < -0.05 ? '−' : '') + v + '%';
  }
  function todayIST() { return new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); }
  function istTime(utc) {
    var d = new Date(Date.parse(utc) + 5.5 * 3600e3), h = d.getUTCHours(), mi = d.getUTCMinutes();
    return fmtDate(d.toISOString().slice(0, 10), 'day') + ', ' + ((h % 12) || 12) + ':' + (mi < 10 ? '0' : '') + mi + (h < 12 ? ' am' : ' pm') + ' IST';
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  function addDays(iso, n) { return new Date(Date.parse(iso) + n * 864e5).toISOString().slice(0, 10); }
  function html(el, s) { el.innerHTML = s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function link(src) { return '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.name) + '</a>'; }
  function pdfName(url) {
    var m = /Pdf_\d+_(\d{4})(\d{2})(\d{2})/.exec(url);
    return m ? 'IBJA daily rate sheet (PDF), published ' + fmtDate(m[1] + '-' + m[2] + '-' + m[3]) : 'IBJA rate sheet';
  }
  function unitOf() { return S.metal === 'silver' ? t('unit_kg') : t('unit_10g'); }
  function H() { return DATA.method.horizons[S.h]; }
  function rateWord(r) { return Math.round(r * 100) + '%'; }

  function applyText() {
    document.querySelectorAll('[data-t]').forEach(function (n) { n.textContent = t(n.getAttribute('data-t')); });
    document.querySelectorAll('.src').forEach(function (n) { n.textContent = t('src_btn'); });
    document.querySelectorAll('[data-metal]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-metal') === S.metal); });
    document.body.classList.toggle('silver-mode', S.metal === 'silver');
  }

  /* ---------- At a glance ---------- */
  function spark(hist, last) {
    var from = Charts.day(last) - 30, pts = hist.filter(function (p) { return Charts.day(p[0]) >= from; });
    if (pts.length < 2) return '';
    var v = pts.map(function (p) { return p[1]; }), lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), W = 120, Hh = 34;
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + (i / (pts.length - 1) * W).toFixed(1) + ',' + (Hh - 3 - (p[1] - lo) / (hi - lo || 1) * (Hh - 6)).toFixed(1); }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none" class="spark" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function renderGlance() {
    html($('glance'), ['gold22', 'gold24', 'silver'].map(function (k) {
      var m = DATA.metals[k], L = m.latest, ch = m.month_ago ? (L.price / m.month_ago.price - 1) * 100 : null;
      return '<button type="button" class="gl' + (k === 'silver' ? ' gl-s' : '') + '" data-metal="' + k + '" aria-pressed="' + (k === S.metal) + '">' +
        '<span class="gl-name">' + esc(t(METAL_NAME[k])) + '</span>' +
        '<span class="gl-price">' + money(L.price) + '</span>' +
        '<span class="gl-unit">' + esc(k === 'silver' ? t('unit_kg') : t('unit_10g')) + '</span>' +
        spark(m.history, L.date) +
        '<span class="gl-ch ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : '') + '">' + (ch == null ? '' : (ch > 0 ? '▲ ' : ch < 0 ? '▼ ' : '') + pct(ch) + '<span class="gl-long"> · ' + esc(t('glance_30')) + '</span>') + '</span></button>';
    }).join(''));
    $('glance').querySelectorAll('.gl').forEach(function (b) {
      b.addEventListener('click', function () { S.metal = b.getAttribute('data-metal'); S.purity = null; store('metal', S.metal); renderAll(); });
    });
  }

  /* ---------- Today ---------- */
  function renderToday(m) {
    var L = m.latest, silver = S.metal === 'silver';
    $('t-price').textContent = money(L.price);
    $('t-unit').textContent = unitOf() + ' · ' + t(METAL_NAME[S.metal]);
    $('t-sub').textContent = t('today_sub', { session: t('sess_' + L.session), date: fmtDate(L.date, 'day') });
    $('t-gst').textContent = money(L.price * 1.03);
    $('t-gram').textContent = money(L.price / (silver ? 1000 : 10));
    var age = daysBetween(L.date, todayIST());
    $('t-stale').hidden = age <= 3;
    $('t-stale').textContent = t('stale', { days: age });
    $('t-checked').textContent = t('today_checked', { t: istTime(DATA.generated_utc) });
    if (m.month_ago) {
      var ch = (L.price / m.month_ago.price - 1) * 100;
      var arrow = ch > 0.05 ? '▲' : ch < -0.05 ? '▼' : '•';
      html($('t-change'), '<span class="arr">' + arrow + '</span> ' + esc(t('vs_month', {
        pct: pct(Math.abs(ch)).replace('+', ''), dir: t(ch > 0.05 ? 'dir_up' : ch < -0.05 ? 'dir_down' : 'dir_same'),
        price: money(m.month_ago.price), date: fmtDate(m.month_ago.date, 'short') })));
    } else $('t-change').textContent = '';
  }

  /* ---------- Old prices ---------- */
  function renderOld(m) {
    document.querySelectorAll('#o-range button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-r') === S.range); });
    var silver = S.metal === 'silver';
    if (S.range === 'all') {
      var rows = DATA.yearly.map(function (r) { return { fy: r.fy, v: silver ? r.silver : r.gold }; }).filter(function (r) { return r.v != null; });
      var a = rows[0], z = rows[rows.length - 1];
      $('o-sub').textContent = t('old_sub_yearly') + ' ' + t('old_then', { then: money(a.v), fy0: a.fy, now: money(z.v), fy1: z.fy }) + ' (' + unitOf() + (silver ? '' : ', RBI “standard gold”') + ').';
      Charts.yearly($('o-chart'), { rows: rows, cls: silver ? 'silver' : 'gold', fmtMoney: money });
      $('o-foot').textContent = t('old_yearly_note');
    } else {
      var back = { '1m': 31, '6m': 183, '1y': 366 }[S.range];
      var last = Charts.day(m.latest.date);
      $('o-sub').textContent = t('old_sub_daily', { metal: t(METAL_NAME[S.metal]), unit: unitOf() });
      Charts.price($('o-chart'), { history: m.history, fromDay: last - back, cls: silver ? 'silver' : 'gold', fmtDate: function (d) { return fmtDate(d); }, fmtMoney: money, monthName: monthName });
      $('o-foot').textContent = '';
    }
    $('o-date').max = m.latest.date;
    renderLookup(m);
  }
  function renderLookup(m) {
    var v = $('o-date').value, out = $('o-out');
    if (!v) { out.textContent = ''; return; }
    var metal = t(METAL_NAME[S.metal]);
    if (v > m.latest.date) { out.textContent = v > todayIST() ? t('lookup_future') : t('lookup_near', { asked: fmtDate(v), date: fmtDate(m.latest.date), price: money(m.latest.price), unit: unitOf() }); return; }
    var first = m.history[0][0];
    if (v < first) {
      var y = +v.slice(0, 4), mo = +v.slice(5, 7), fy = (mo >= 4 ? y : y - 1), fyl = fy + '-' + String(fy + 1).slice(2);
      var row = DATA.yearly.filter(function (r) { return r.fy === fyl; })[0];
      var val = row && (S.metal === 'silver' ? row.silver : row.gold);
      out.textContent = val ? (S.metal === 'gold22' ? t('lookup_22k') : '') + t('lookup_year', { first: fmtDate(first), fy: fyl, price: money(val), unit: unitOf() }) : t('lookup_none');
      return;
    }
    var exact = null, before = null;
    m.history.forEach(function (p) { if (p[0] === v) exact = p; if (p[0] < v) before = p; });
    if (exact) { out.textContent = t('lookup_exact', { metal: metal, date: fmtDate(v, 'day'), price: money(exact[1]), unit: unitOf(), session: 'closing' }); return; }
    if (before && daysBetween(before[0], v) <= 4) { out.textContent = t('lookup_near', { asked: fmtDate(v, 'day'), date: fmtDate(before[0], 'day'), price: money(before[1]), unit: unitOf() }); return; }
    out.textContent = t('lookup_gap', { asked: fmtDate(v) });
  }

  /* ---------- Price later ---------- */
  function renderTicks() {
    html($('n-ticklabels'), DATA.method.horizons.map(function (h, i) {
      return '<button type="button" data-i="' + i + '" aria-pressed="' + (i === S.h) + '">' + esc(t('h_' + h.key)) + '</button>';
    }).join(''));
    $('n-ticklabels').querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { setH(+b.getAttribute('data-i')); }); });
  }
  function setH(i) { S.h = i; $('n-h').value = i; store('h', i); renderNext(DATA.metals[S.metal]); renderRecord(DATA.metals[S.metal]); }
  function renderNext(m) {
    var h = H(), f = m.forecasts[h.key], bt = m.backtests[h.key];
    renderTicks();
    $('n-h').setAttribute('aria-valuetext', t('h_' + h.key));
    if (!f) { $('n-lead').textContent = t('next_none'); return; }
    var P = m.latest.price, metal = t('g_' + S.metal);
    $('n-lead').textContent = t('next_main', { date: fmtDate(f.target, 'day'), metal: metal });
    $('n-low').textContent = money(f.low80, 100);
    $('n-high').textContent = money(f.high80, 100);
    $('n-50').textContent = money(f.low50, 100) + ' – ' + money(f.high50, 100);
    var span = f.high80 - f.low80, pos = function (v) { return ((v - f.low80) / span * 100).toFixed(2) + '%'; };
    html($('n-line'),
      '<div class="nl-bar"><div class="nl-50" style="left:' + pos(f.low50) + ';width:calc(' + pos(f.high50) + ' - ' + pos(f.low50) + ')"></div>' +
      '<div class="nl-now" style="left:' + pos(P) + '"></div></div>' +
      '<div class="nl-labels"><div><span>' + esc(t('lo_end')) + '</span><b>' + money(f.low80, 100) + '</b><em>' + pct((f.low80 / P - 1) * 100) + '</em></div>' +
      '<div class="c"><span>' + esc(t('now_lbl')) + '</span><b>' + money(P) + '</b></div>' +
      '<div class="r"><span>' + esc(t('hi_end')) + '</span><b>' + money(f.high80, 100) + '</b><em>' + pct((f.high80 / P - 1) * 100) + '</em></div></div>');
    var rate = bt.n ? bt.hit80 / bt.n : null;
    var spanName = t('h_' + h.key);
    var score = bt.status === 'untested' ? t('next_nodata')
      : bt.status === 'early' ? t('next_untested', { n: bt.n, months: bt.months.length }) + ' (' + bt.hit80 + ' of ' + bt.n + ' right so far.)'
      : t('next_score', { span: spanName, k: bt.hit80, n: bt.n, pct: rateWord(rate) });
    $('n-score').textContent = score;
    $('n-score').className = 'score-line' + (bt.status !== 'tested' ? ' early' : '');
    $('n-warn').hidden = !(rate != null && rate < 0.7);
    $('n-warn').textContent = rate != null ? t('warn_low', { pct: rateWord(rate), metal: metal }) : '';
    var back = Math.max(30, h.days * 3);
    Charts.price($('n-chart'), {
      history: m.history, fromDay: Charts.day(f.made_on) - back,
      range: { start: f.made_on, price: P, sigma: m.sigma_daily, trading: h.trading, days: h.days, low80: f.low80, high80: f.high80 },
      cls: S.metal === 'silver' ? 'silver' : 'gold', fmtDate: function (d) { return fmtDate(d); }, fmtMoney: money, monthName: monthName,
      tipRange: function (d, lo, hi) { return t('tip_range', { date: fmtDate(d, 'short'), lo: lo, hi: hi }); }
    });
    $('n-chart').setAttribute('aria-label', t('chart_80') + ': ' + money(f.low80, 100) + ' – ' + money(f.high80, 100));
    html($('n-legend'), '<span><i class="sw line"></i>' + esc(t('chart_past')) + '</span><span><i class="sw b80"></i>' + esc(t('chart_80')) + '</span><span><i class="sw b50"></i>' + esc(t('chart_50')) + '</span>');
    $('n-how').textContent = t('next_how_text', { n: m.moves_used });
  }

  /* ---------- Were we right? ---------- */
  function renderRecord(m) {
    var rows = DATA.method.horizons.map(function (h, i) {
      var bt = m.backtests[h.key];
      var past = bt.n ? bt.hit80 + ' / ' + bt.n + ' <b>' + rateWord(bt.hit80 / bt.n) + '</b>' : '–';
      if (bt.status === 'early') past += ' <span class="badge">' + esc(t('rec_early')) + '</span>';
      if (bt.status === 'untested') past = '<span class="badge">' + esc(t('rec_untested')) + '</span>';
      var live = DATA.record.filter(function (r) { return r.metal === S.metal && r.horizon_days === h.days; });
      var chk = live.filter(function (r) { return r.status === 'checked'; });
      var liveTxt = !live.length ? t('rec_none') : chk.length ? t('rec_live_k', { k: chk.filter(function (r) { return r.h80; }).length, n: chk.length })
        : t('rec_waiting', { date: fmtDate(live.reduce(function (a, r) { return r.target_date < a ? r.target_date : a; }, live[0].target_date), 'short') });
      return '<tr' + (i === S.h ? ' class="sel"' : '') + ' data-i="' + i + '"><td>' + esc(t('h_' + h.key)) + '</td><td>' + past + '</td><td>' + esc(liveTxt) + '</td></tr>';
    }).join('');
    html($('r-table'), '<table><tr><th>' + esc(t('rec_span')) + '</th><th>' + esc(t('rec_past')) + '</th><th>' + esc(t('rec_live')) + '</th></tr>' + rows + '</table>');
    $('r-table').querySelectorAll('tr[data-i]').forEach(function (tr) { tr.addEventListener('click', function () { setH(+tr.getAttribute('data-i')); }); });
    var h = H(), b = m.backtests[h.key];
    $('r-strip-title').textContent = t('record_strip', { span: t('h_' + h.key), metal: t(METAL_NAME[S.metal]) });
    html($('r-strip'), b.points.map(function (p) {
      var title = fmtDate(p.d) + ' → ' + fmtDate(p.ad) + ': ' + money(p.a) + ' (' + money(p.lo80, 100) + ' – ' + money(p.hi80, 100) + ')';
      return '<i class="mk ' + (p.h80 ? 'hit' : 'miss') + '" title="' + esc(title) + '"></i>';
    }).join(''));
    var rate = b.n ? b.hit80 / b.n : null;
    $('r-verdict').hidden = rate == null;
    $('r-verdict').textContent = rate == null ? '' : rate < 0.7 ? t('record_low') : rate > 0.92 ? t('record_high') : t('record_ok');
  }

  /* ---------- Check your bill ---------- */
  function renderBill() {
    var R = DATA.bill_rates, p = S.purity || DEFAULT_PURITY[S.metal];
    document.querySelectorAll('#b-purity button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-p') === p); });
    document.querySelectorAll('#b-mode button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === S.mode); });
    $('b-making').placeholder = S.mode === 'pct' ? 'e.g. 12' : 'e.g. 800';
    var rate = Calc.ratePerGram(R.per_10g, p);
    var res = Calc.bill({ weight: $('b-weight').value, ratePerGram: rate, making: $('b-making').value, makingMode: S.mode, billTotal: $('b-total').value });
    $('b-rate').textContent = t('bill_rate') + ': IBJA ' + t('sess_' + R.session) + ' rate, ' + fmtDate(R.date) + ' · ' + t('p_' + p) + ' ' + money(rate) + ' ' + t('unit_g') + (p === 's925' ? ' (999 rate × 925/999)' : '');
    if (!res) { html($('b-result'), '<div class="empty">' + esc(t('bill_empty')) + '</div>'); return; }
    var s = '<div class="ln"><span>' + esc(t('r_metal')) + '</span><b>' + money(res.metal) + '</b></div>' +
      '<div class="ln"><span>' + esc(t('r_making')) + '</span><b>' + money(res.making) + '</b></div>' +
      '<div class="ln"><span>' + esc(t('r_gst')) + '</span><b>' + money(res.gst) + '</b></div>' +
      '<div class="ln tot"><span>' + esc(t('r_total')) + '</span><b>' + money(res.total) + '</b></div>';
    if (res.diff != null) {
      s += '<div class="diff">' + esc(t(res.diff >= 0 ? 'bill_diff_more' : 'bill_diff_less', { amt: money(Math.abs(res.diff)), pct: pct(Math.abs(res.diffPct)).replace('+', '') })) + '</div>' +
        '<div class="note">' + esc(t('bill_diff_note')) + '</div>';
    }
    html($('b-result'), s);
  }

  /* ---------- What changes the price ---------- */
  function renderWhy(m) {
    var duty = DATA.facts.duty.rate_pct;
    var w = +$('w-world').value, r = +$('w-rupee').value, d = +$('w-duty').value;
    $('w-world-v').textContent = w === 0 ? 'no change' : pct(w, 0);
    $('w-rupee-v').textContent = r === 0 ? 'no change' : Math.abs(r) + '% ' + t(r > 0 ? 's_stronger' : 's_weaker');
    $('w-duty-v').textContent = d + '% · ' + t('s_now', { v: duty + '%' });
    // rupee slider: right = stronger rupee = fewer rupees per dollar
    var out = Calc.whatIf(m.latest.price, w, -r, duty, d);
    $('w-label').textContent = t('why_result', { metal: t('g_' + S.metal) });
    $('w-price').textContent = money(out.price);
    $('w-pct').textContent = t('why_result2', { pct: pct(out.pct) });
    var ex = DATA.duty_example;
    $('w-example').hidden = !ex;
    if (ex) $('w-example').textContent = t('why_example_text', { a: money(ex.before.g999_pm), b: money(ex.after.g999_pm), pct: pct((ex.after.g999_pm / ex.before.g999_pm - 1) * 100) });
  }

  /* ---------- Big news days ---------- */
  function renderDates() {
    var today = todayIST();
    var list = DATA.events.filter(function (e) { return e.end >= today; }).slice(0, 6);
    html($('d-list'), list.map(function (e) {
      var p = e.start.split('-'), q = e.end.split('-');
      var dd = +p[2] + (e.end !== e.start ? '–' + (+q[2]) : '');
      return '<li><div class="cal"><div class="m">' + esc(monthName(+p[1] - 1)) + '</div><div class="d">' + dd + '</div><div class="y">' + p[0] + '</div></div>' +
        '<div><div class="t">' + esc(e.en.title) + ' <span class="st">' + esc(t('st_' + e.status)) + '</span></div><p>' + esc(e.en.meaning) + '</p>' + link(e.source) + '</div></li>';
    }).join(''));
    var past = (DATA.event_outcomes || []).slice().reverse();
    function mv(x) { return x ? '<span class="' + (x.pct > 0 ? 'up' : x.pct < 0 ? 'down' : '') + '">' + (x.pct > 0 ? '▲ ' : x.pct < 0 ? '▼ ' : '') + pct(x.pct) + '</span>' : '–'; }
    html($('d-past'), '<table><tr><th>' + esc(t('th_date')) + '</th><th>' + esc(t('th_event')) + '</th><th>' + esc(t('th_g')) + '</th><th>' + esc(t('th_s')) + '</th></tr>' + past.map(function (e) {
      return '<tr><td>' + esc(fmtDate(e.end)) + '</td><td>' + link({ name: e.title, url: e.source.url }) + '</td><td>' + mv(e.moves.gold24) + '</td><td>' + mv(e.moves.silver) + '</td></tr>';
    }).join('') + '</table>');
  }

  /* ---------- How this works ---------- */
  function renderAbout() {
    var D = DATA.data, M = DATA.method;
    $('a-where').textContent = t('a_where_text', { days: D.days, first: fmtDate(D.first), last: fmtDate(D.last) });
    $('a-check1').textContent = t('a_check_1', { n: D.dropped_values });
    var sg = DATA.sgb_checks, ok = sg.filter(function (c) { return c.match; }).length;
    $('a-check2').textContent = t('a_check_2', { k: ok, n: sg.length });
    html($('a-sgb'), '<table><tr><th>RBI date</th><th>IBJA days</th><th>RBI ₹/g</th><th>Ours ₹/g</th><th></th></tr>' + sg.map(function (c) {
      return '<tr><td><a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.rbi_date) + '</a></td><td>' + esc(c.ibja_days) + '</td><td>' + c.rbi_rs_per_g.toLocaleString('en-IN') + '</td><td>' + c.ours_rs_per_g.toLocaleString('en-IN') + '</td><td class="ok">' + (c.match ? '✓' : '✗') + '</td></tr>';
    }).join('') + '</table>');
    $('a-check3').textContent = t('a_check_3', { n: D.multi_source_days });
    html($('a-gaps'), DATA.metals.gold24.gaps.map(function (g) { return '<li>' + esc(fmtDate(g[0])) + ' – ' + esc(fmtDate(g[1])) + '</li>'; }).join(''));
    $('a-method').textContent = t('a_method_text', { w: M.window, m: M.min_moves, z80: M.z80, z50: M.z50, v: M.version });
    var F = DATA.facts, srcs = [{ name: 'RBI: ' + DATA.yearly_source.name, url: DATA.yearly_source.url }];
    ['ibja', 'gst', 'duty', 'huid'].forEach(function (k) { (F[k].sources || []).forEach(function (s) { srcs.push(s); }); });
    DATA.events.forEach(function (e) { if (!srcs.some(function (s) { return s.url === e.source.url; })) srcs.push(e.source); });
    D.sources.forEach(function (u) { srcs.push({ name: pdfName(u), url: u }); });
    html($('a-sources'), srcs.map(function (s) { return '<li>' + link(s) + '</li>'; }).join(''));
    $('a-updated').textContent = t('a_updated', { t: istTime(DATA.generated_utc) });
  }

  function sourcesFor(key) {
    var m = DATA.metals[S.metal], F = DATA.facts;
    var ibjaLatest = { name: pdfName(m.latest.source), url: m.latest.source };
    var csv = { name: 'Daily IBJA prices used (CSV)', url: 'data/ibja_daily.csv' }, led = { name: 'Saved ranges, public record (CSV)', url: 'data/forecasts.csv' };
    var rbi = { name: 'RBI: ' + DATA.yearly_source.name, url: DATA.yearly_source.url };
    return {
      today: [ibjaLatest].concat(F.ibja.sources),
      old: [csv, rbi],
      next: [ibjaLatest, csv, led],
      record: [led, csv, { name: 'All numbers on this page (JSON)', url: 'data/site.json' }],
      bill: F.gst.sources.concat([{ name: pdfName(DATA.bill_rates.source), url: DATA.bill_rates.source }]),
      why: F.duty.sources.concat([F.duty.pass_through.source]).concat((DATA.duty_example ? DATA.duty_example.sources : []).map(function (u) { return { name: pdfName(u), url: u }; })),
      dates: DATA.events.map(function (e) { return e.source; }).filter(function (s, i, a) { return a.findIndex(function (x) { return x.url === s.url; }) === i; }),
      tips: F.huid.sources
    }[key] || [];
  }
  function openSheet(key) {
    html($('sheet-list'), sourcesFor(key).map(function (s) { return '<li>' + link(s) + '</li>'; }).join(''));
    $('sheet').hidden = false; $('sheet-back').hidden = false; $('sheet-close').focus();
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet-back').hidden = true; }

  function renderAll() {
    applyText();
    document.querySelectorAll('main .card, #glance').forEach(function (c) { c.hidden = false; });
    renderGlance();
    $('loading').hidden = true;
    var m = DATA.metals[S.metal];
    renderToday(m); renderOld(m); renderNext(m); renderRecord(m); renderBill(); renderWhy(m); renderDates(); renderAbout();
  }

  function wire() {
    document.querySelectorAll('[data-metal]').forEach(function (b) { b.addEventListener('click', function () { S.metal = b.getAttribute('data-metal'); S.purity = null; store('metal', S.metal); renderAll(); }); });
    document.querySelectorAll('#o-range button').forEach(function (b) { b.addEventListener('click', function () { S.range = b.getAttribute('data-r'); renderOld(DATA.metals[S.metal]); }); });
    $('o-date').addEventListener('input', function () { renderLookup(DATA.metals[S.metal]); });
    $('n-h').addEventListener('input', function () { setH(+$('n-h').value); });
    document.querySelectorAll('#b-purity button').forEach(function (b) { b.addEventListener('click', function () { S.purity = b.getAttribute('data-p'); renderBill(); }); });
    document.querySelectorAll('#b-mode button').forEach(function (b) { b.addEventListener('click', function () { S.mode = b.getAttribute('data-mode'); renderBill(); }); });
    ['b-weight', 'b-making', 'b-total'].forEach(function (id) { $(id).addEventListener('input', renderBill); });
    ['w-world', 'w-rupee', 'w-duty'].forEach(function (id) { $(id).addEventListener('input', function () { renderWhy(DATA.metals[S.metal]); }); });
    document.querySelectorAll('.src').forEach(function (b) { b.addEventListener('click', function () { openSheet(b.getAttribute('data-src')); }); });
    $('sheet-close').addEventListener('click', closeSheet); $('sheet-back').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
    var rz;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (DATA) { renderOld(DATA.metals[S.metal]); renderNext(DATA.metals[S.metal]); } }, 200); });
  }

  function init() {
    var q = new URLSearchParams(location.search);
    var mt = q.get('metal') || store('metal');
    if (mt && METAL_NAME[mt]) S.metal = mt;
    var h = store('h'); if (h != null && +h >= 0 && +h <= 3) S.h = +h;
    $('n-h').value = S.h;
    if (window.innerWidth >= 1000) $('w-try').open = true;   // more room on big screens
    applyText(); wire();
    fetch('data/site.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { DATA = d; renderAll(); })
      .catch(function (e) { $('loading').textContent = t('err'); if (window.console) console.warn(e); });
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  init();
})();
