(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var DATA = null;
  var S = { lang: 'en', metal: 'gold22', purity: null, mode: 'pct' };
  var METAL_NAME = { gold22: 'm_gold22', gold24: 'm_gold24', silver: 'm_silver' };
  var DEFAULT_PURITY = { gold22: 'g916', gold24: 'g999', silver: 's999' };

  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  function t(key, vars) {
    var s = I18N.en[key] || key;
    if (vars) for (var k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  function fmtDate(iso, short) {
    var p = iso.split('-'), d = +p[2], m = +p[1] - 1, y = p[0];
    return d + ' ' + EN_MONTHS[m] + (short ? '' : ' ' + y);
  }
  function monthName(i) { return EN_MONTHS[i]; }
  function money(x, round) { return Calc.inr(x, round ? { round: round } : null); }
  function pct(x, dp) {
    if (x == null || !isFinite(x)) return '–';
    var v = Math.abs(x).toFixed(dp == null ? 1 : dp);
    return (x > 0.05 ? '+' : x < -0.05 ? '−' : '') + v + '%';
  }
  function todayIST() {
    var d = new Date(Date.now() + 5.5 * 3600e3);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  function html(el, s) { el.innerHTML = s; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function link(src) { return '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.name) + '</a>'; }
  function pdfName(url) {
    var m = /Pdf_\d+_(\d{4})(\d{2})(\d{2})/.exec(url);
    return m ? 'IBJA daily rate sheet (PDF), published ' + fmtDate(m[1] + '-' + m[2] + '-' + m[3]) : 'IBJA rate sheet';
  }

  /* ---------- static text ---------- */
  function applyText() {
    document.querySelectorAll('[data-t]').forEach(function (n) { n.textContent = t(n.getAttribute('data-t')); });
    document.querySelectorAll('.src').forEach(function (n) { n.textContent = t('src_btn'); });
    document.querySelectorAll('[data-metal]').forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-metal') === S.metal); });
    document.body.classList.toggle('silver-mode', S.metal === 'silver');
  }

  /* ---------- sections ---------- */
  function renderToday(m) {
    var L = m.latest, silver = S.metal === 'silver';
    $('t-price').textContent = money(L.price);
    $('t-unit').textContent = (silver ? t('unit_kg') : t('unit_10g')) + ' · ' + t(METAL_NAME[S.metal]);
    $('t-sub').textContent = t('today_sub', { session: t('sess_' + L.session), date: fmtDate(L.date) });
    $('t-gst').textContent = money(L.price * 1.03);
    $('t-gram').textContent = money(L.price / (silver ? 1000 : 10));
    var age = daysBetween(L.date, todayIST());
    $('t-stale').hidden = age <= 3;
    $('t-stale').textContent = t('stale', { days: age });
    if (m.month_ago) {
      var ch = (L.price / m.month_ago.price - 1) * 100;
      var arrow = ch > 0.05 ? '▲' : ch < -0.05 ? '▼' : '•';
      html($('t-change'), '<span class="arr">' + arrow + '</span> ' + esc(t('vs_month', {
        arrow: '', pct: pct(Math.abs(ch)).replace('+', ''), dir: t(ch > 0.05 ? 'dir_up' : ch < -0.05 ? 'dir_down' : 'dir_same'),
        price: money(m.month_ago.price), date: fmtDate(m.month_ago.date, true)
      })).replace(/\s+/, ' '));
    } else $('t-change').textContent = '';
  }

  function renderNext(m) {
    var f = m.forecast, card = $('next');
    if (!f) { $('n-lead').textContent = t('next_none'); return; }
    var P = m.latest.price;
    $('n-lead').textContent = t('next_main', { date: fmtDate(f.target), metal: t('g_' + S.metal) });
    $('n-low').textContent = money(f.low80, 100);
    $('n-high').textContent = money(f.high80, 100);
    $('n-and').textContent = t('next_and');
    var dots = ''; for (var i = 0; i < 10; i++) dots += '<i' + (i >= 8 ? ' class="off"' : '') + '></i>';
    html($('n-dots'), dots);
    $('n-50').textContent = money(f.low50, 100) + ' – ' + money(f.high50, 100);
    var span = f.high80 - f.low80, pos = function (v) { return ((v - f.low80) / span * 100).toFixed(2) + '%'; };
    html($('n-bar'), '<div class="b80"></div><div class="b50" style="left:' + pos(f.low50) + ';right:calc(100% - ' + pos(f.high50) + ')"></div>' +
      '<div class="now" style="left:' + pos(P) + '"><span>' + esc(t('chart_today')) + '</span></div>' +
      '<span class="pc" style="left:0">' + pct((f.low80 / P - 1) * 100) + '</span><span class="pc" style="right:0">' + pct((f.high80 / P - 1) * 100) + '</span>');
    Charts.fan($('n-chart'), {
      history: m.history, forecast: f, startPrice: P, sigmaMonth: f.sigma_daily * Math.sqrt(DATA.method.horizon_trading_days),
      cls: S.metal === 'silver' ? 'silver' : 'gold', fmtDate: function (d) { return fmtDate(d); }, fmtMoney: money, monthName: monthName
    });
    $('n-chart').setAttribute('aria-label', t('chart_80') + ': ' + money(f.low80, 100) + ' – ' + money(f.high80, 100));
    html($('n-legend'), '<span><i class="sw line"></i>' + esc(t('chart_past')) + '</span><span><i class="sw b80"></i>' + esc(t('chart_80')) + '</span><span><i class="sw b50"></i>' + esc(t('chart_50')) + '</span>');
    $('n-means').textContent = t('next_means', { low: money(f.low80, 100), lowPct: pct((f.low80 / P - 1) * 100), high: money(f.high80, 100), highPct: pct((f.high80 / P - 1) * 100) });
    $('n-how').textContent = t('next_how_text', { n: f.moves_used });
    card.hidden = false;
  }

  function renderRecord(m) {
    var rec = DATA.record.filter(function (r) { return r.metal === S.metal; });
    var checked = rec.filter(function (r) { return r.status === 'checked'; });
    var waiting = rec.filter(function (r) { return r.status === 'waiting'; });
    if (!rec.length) $('r-live').textContent = t('record_live_start');
    else if (!checked.length) {
      var first = rec.reduce(function (a, r) { return r.target_date < a ? r.target_date : a; }, rec[0].target_date);
      $('r-live').textContent = t('record_live_wait', { n: rec.length, target: fmtDate(first) }) + ' ' + t('record_live_since', { date: fmtDate(rec[0].made_on) });
    } else {
      var k = checked.filter(function (r) { return r.h80; }).length;
      $('r-live').textContent = t('record_live_some', { k: k, n: checked.length, pct: Math.round(k / checked.length * 100) + '%', w: waiting.length });
    }
    var b = m.backtest;
    if (!b.n) { $('r-score').textContent = '–'; return; }
    $('r-score').textContent = b.hit80 + ' / ' + b.n;
    var rate = b.hit80 / b.n;
    $('r-pct').textContent = Math.round(rate * 100) + '%';
    html($('r-strip'), b.points.map(function (p) {
      var title = fmtDate(p.d) + ' → ' + fmtDate(p.ad) + ': ' + money(p.a) + ' (' + money(p.lo80, 100) + ' – ' + money(p.hi80, 100) + ')';
      return '<i class="mk ' + (p.h80 ? 'hit' : 'miss') + '" title="' + esc(title) + '"></i>';
    }).join(''));
    $('r-strip').setAttribute('aria-label', b.hit80 + ' / ' + b.n);
    $('r-verdict').textContent = rate < 0.7 ? t(S.metal === 'silver' ? 'record_low' : 'record_lowg') : rate > 0.92 ? t('record_high') : t('record_ok');
    $('r-50').textContent = t('record_50', { k: b.hit50, n: b.n, pct: Math.round(b.hit50 / b.n * 100) + '%' });
    $('r-note').textContent = t('record_past_note', { n: b.n, months: b.months.length, first: fmtDate(b.points[0].d), last: fmtDate(b.points[b.points.length - 1].d) });
  }

  function renderBill() {
    var R = DATA.bill_rates, p = S.purity || DEFAULT_PURITY[S.metal];
    document.querySelectorAll('#b-purity button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-p') === p); });
    document.querySelectorAll('#b-mode button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-mode') === S.mode); });
    var rate = Calc.ratePerGram(R.per_10g, p);
    var res = Calc.bill({ weight: $('b-weight').value, ratePerGram: rate, making: $('b-making').value, makingMode: S.mode, billTotal: $('b-total').value });
    $('b-rate').textContent = t('bill_rate') + ': IBJA · ' + fmtDate(R.date) + ' · ' + t('sess_' + R.session) + ' · ' + t('p_' + p) + ' ' + money(rate) + ' ' + t('unit_g') + (p === 's925' ? ' (999 × 925/999)' : '');
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

  function renderWhy(m) {
    var duty = DATA.facts.duty.rate_pct;
    var w = +$('w-world').value, r = +$('w-rupee').value, d = +$('w-duty').value;
    $('w-world-v').textContent = pct(w, 0);
    $('w-rupee-v').textContent = r === 0 ? '0%' : pct(Math.abs(r), 0).replace('+', '') + ' ' + t(r > 0 ? 's_rupee_weak' : 's_rupee_strong');
    $('w-duty-v').textContent = d + '% · ' + t('s_now', { v: duty + '%' });
    var out = Calc.whatIf(m.latest.price, w, r, duty, d);
    $('w-label').textContent = t('why_result', { metal: t('g_' + S.metal) });
    $('w-price').textContent = money(out.price);
    $('w-pct').textContent = t('why_result2', { pct: pct(out.pct) });
    var ex = DATA.duty_example;
    if (ex) $('w-example').textContent = t('why_example_text', { a: money(ex.before.g999_pm), b: money(ex.after.g999_pm), pct: pct((ex.after.g999_pm / ex.before.g999_pm - 1) * 100) });
  }

  function renderDates() {
    var today = todayIST();
    var list = DATA.events.filter(function (e) { return e.end >= today; });
    html($('d-list'), list.map(function (e) {
      var p = e.start.split('-'), L = e.en;
      var dd = +p[2] + (e.end !== e.start ? '–' + (+e.end.split('-')[2]) : '');
      return '<li><div class="cal"><div class="m">' + esc(monthName(+p[1] - 1)) + '</div><div class="d">' + dd + '</div><div class="m" style="color:var(--ink3)">' + p[0] + '</div></div>' +
        '<div><div class="t">' + esc(L.title) + '<span class="st">' + esc(t('st_' + e.status)) + '</span></div><p>' + esc(L.meaning) + '</p>' + link(e.source) + '</div></li>';
    }).join(''));
  }

  function renderHistory() {
    var silver = S.metal === 'silver';
    var rows = DATA.yearly.map(function (r) { return { fy: r.fy, v: silver ? r.silver : r.gold }; }).filter(function (r) { return r.v != null; });
    var a = rows[0], z = rows[rows.length - 1];
    $('h-then').textContent = (silver ? t('hist_silver_label') : t('hist_gold_label')) + ': ' + t('hist_then', { then: money(a.v), fy0: a.fy, now: money(z.v), fy1: z.fy });
    Charts.yearly($('h-chart'), { rows: rows, cls: silver ? 'silver' : 'gold', fmtMoney: money });
  }

  function renderAbout() {
    var D = DATA.data, M = DATA.method;
    $('a-where').textContent = t('a_where_text', { days: D.days, first: fmtDate(D.first), last: fmtDate(D.last) });
    $('a-check1').textContent = t('a_check_1', { n: D.dropped_values });
    var sg = DATA.sgb_checks, ok = sg.filter(function (c) { return c.match; }).length;
    $('a-check2').textContent = t('a_check_2', { k: ok, n: sg.length });
    html($('a-sgb'), '<table><tr><th>RBI</th><th>IBJA</th><th>RBI ₹/g</th><th>IBJA avg ₹/g</th><th></th></tr>' + sg.map(function (c) {
      return '<tr><td><a href="' + esc(c.url) + '" target="_blank" rel="noopener">' + esc(c.rbi_date) + '</a></td><td>' + esc(c.ibja_days) + '</td><td>' + c.rbi_rs_per_g.toLocaleString('en-IN') + '</td><td>' + c.ours_rs_per_g.toLocaleString('en-IN') + '</td><td class="ok">' + (c.match ? '✓' : '✗') + '</td></tr>';
    }).join('') + '</table>');
    $('a-check3').textContent = t('a_check_3', { n: D.multi_source_days });
    var gaps = DATA.metals.gold24.gaps;
    html($('a-gaps'), gaps.map(function (g) { return '<li>' + esc(fmtDate(g[0])) + ' – ' + esc(fmtDate(g[1])) + '</li>'; }).join(''));
    $('a-method').textContent = t('a_method_text', { w: M.window, m: M.min_moves, h: M.horizon_trading_days, z80: M.z80, z50: M.z50, d: M.horizon_days });
    var F = DATA.facts, srcs = [];
    srcs.push({ name: 'RBI: ' + DATA.yearly_source.name, url: DATA.yearly_source.url });
    ['ibja', 'gst', 'duty', 'huid'].forEach(function (k) { (F[k].sources || []).forEach(function (s) { srcs.push(s); }); });
    DATA.events.forEach(function (e) { if (!srcs.some(function (s) { return s.url === e.source.url; })) srcs.push(e.source); });
    D.sources.forEach(function (u) { srcs.push({ name: pdfName(u), url: u }); });
    html($('a-sources'), srcs.map(function (s) { return '<li>' + link(s) + '</li>'; }).join(''));
    $('a-updated').textContent = t('a_updated', { t: DATA.generated_utc.replace('T', ' ').replace('Z', '') });
  }

  function sourcesFor(key) {
    var m = DATA.metals[S.metal], F = DATA.facts, out = [];
    var ibjaLatest = { name: pdfName(m.latest.source), url: m.latest.source };
    if (key === 'today') out = [ibjaLatest].concat(F.ibja.sources);
    if (key === 'next') out = [ibjaLatest, { name: 'Daily IBJA prices used (CSV)', url: 'data/ibja_daily.csv' }, { name: 'Saved ranges, public record (CSV)', url: 'data/forecasts.csv' }];
    if (key === 'record') out = [{ name: 'Saved ranges, public record (CSV)', url: 'data/forecasts.csv' }, { name: 'Daily IBJA prices used (CSV)', url: 'data/ibja_daily.csv' }, { name: 'All numbers on this page (JSON)', url: 'data/site.json' }];
    if (key === 'bill') out = F.gst.sources.concat([{ name: pdfName(DATA.bill_rates.source), url: DATA.bill_rates.source }]);
    if (key === 'why') out = F.duty.sources.concat([F.duty.pass_through.source]).concat((DATA.duty_example ? DATA.duty_example.sources : []).map(function (u) { return { name: pdfName(u), url: u }; }));
    if (key === 'tips') out = F.huid.sources;
    if (key === 'history') out = [{ name: 'RBI: ' + DATA.yearly_source.name, url: DATA.yearly_source.url }, { name: 'Research report (all years, notes and gaps)', url: F.duty.pass_through.source.url }];
    return out;
  }
  function openSheet(key) {
    html($('sheet-list'), sourcesFor(key).map(function (s) { return '<li>' + link(s) + '</li>'; }).join(''));
    $('sheet').hidden = false; $('sheet-back').hidden = false; $('sheet-close').focus();
  }
  function closeSheet() { $('sheet').hidden = true; $('sheet-back').hidden = true; }

  function renderAll() {
    applyText();
    var m = DATA.metals[S.metal];
    renderToday(m); renderNext(m); renderRecord(m); renderBill(); renderWhy(m); renderDates(); renderHistory(); renderAbout();
    document.querySelectorAll('main .card').forEach(function (c) { c.hidden = false; });
    $('loading').hidden = true;
  }

  /* ---------- events ---------- */
  function wire() {
    document.querySelectorAll('[data-metal]').forEach(function (b) { b.addEventListener('click', function () { S.metal = b.getAttribute('data-metal'); S.purity = null; store('metal', S.metal); renderAll(); }); });
    document.querySelectorAll('#b-purity button').forEach(function (b) { b.addEventListener('click', function () { S.purity = b.getAttribute('data-p'); renderBill(); }); });
    document.querySelectorAll('#b-mode button').forEach(function (b) { b.addEventListener('click', function () { S.mode = b.getAttribute('data-mode'); renderBill(); }); });
    ['b-weight', 'b-making', 'b-total'].forEach(function (id) { $(id).addEventListener('input', renderBill); });
    ['w-world', 'w-rupee', 'w-duty'].forEach(function (id) { $(id).addEventListener('input', function () { renderWhy(DATA.metals[S.metal]); }); });
    document.querySelectorAll('.src').forEach(function (b) { b.addEventListener('click', function () { openSheet(b.getAttribute('data-src')); }); });
    $('sheet-close').addEventListener('click', closeSheet); $('sheet-back').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  }

  function init() {
    var q = new URLSearchParams(location.search);
    var mt = q.get('metal') || store('metal');
    if (mt && METAL_NAME[mt]) S.metal = mt;
    applyText(); wire();
    fetch('data/site.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) { DATA = d; renderAll(); })
      .catch(function () { $('loading').textContent = t('err'); });
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(function () {});
  }
  var rz;
  window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (DATA) { renderNext(DATA.metals[S.metal]); renderHistory(); } }, 200); });
  init();
})();
