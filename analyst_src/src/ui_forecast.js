/* Forecast page: controls, anchor/P0 inputs, KPI strip, fan chart joined to SSOT history, waterfall, notes, exports. */
(function () {
  'use strict';
  var UI = window.UI, E = UI.E, DB = UI.DB, $ = UI.$, el = UI.el, F = UI.F;
  var METALS = ['gold', 'silver'];
  var REGIMES = [['1963-01-10', '1963 Gold Control', '1963'], ['1991-07-01', '1991 balance-of-payments crisis', '1991'], ['1997-10-21', '1997 open licence imports', '1997'], ['2000-04-01', '2000-01 RBI series break', '2000-01'],
    ['2013-08-14', '2013 80:20 rule', '80:20'], ['2024-07-24', 'Jul 2024 duty cut to 6%', 'Jul 24'], ['2026-05-13', 'May 2026 duty rise to 15% + silver restriction (16 May)', 'May 26']];
  UI.REGIMES = REGIMES;

  // ---------------------------------------------------------------- tooltip
  var tip = function () { return $('tip'); };
  UI.showTip = function (ev, lines) {
    var t = tip(); t.replaceChildren(); lines.forEach(function (l, i) { t.appendChild(el('div', { cls: i === 0 ? 'h' : 'm', text: l })); });
    t.style.opacity = 1; var w = t.offsetWidth, h = t.offsetHeight, x = ev.clientX + 14, y = ev.clientY - h / 2;
    if (x + w > innerWidth - 6) x = ev.clientX - w - 14; y = Math.max(6, Math.min(innerHeight - h - 6, y)); t.style.left = Math.max(6, x) + 'px'; t.style.top = y + 'px';
  };
  UI.hideTip = function () { tip().style.opacity = 0; };

  // ---------------------------------------------------------------- input table (built once, synced on render)
  var ROWS = [
    ['src', 'Anchor source', 'select', [['auto', 'Auto (live → yours → SSOT benchmark for 1Y)'], ['live', 'Live (Mode B)'], ['user', 'Your spot entry'], ['ssot', 'SSOT benchmark (1Y only)']]],
    ['_anchor', 'Anchor in use', 'text'],
    ['uv', 'Your spot (gold Rs/10 g · silver Rs/kg)', 'number'],
    ['ud', 'Spot date', 'date'],
    ['ub', 'Spot basis', 'select', [['999', '999 (stated)'], ['995', '995 (stated)'], ['RBI Standard Gold (purity not stated)', 'RBI Standard Gold (purity not stated)'], ['Other basis (stated by user)', 'Other basis (stated by user)']]],
    ['bench', 'SSOT benchmark (1Y)', 'select', [['aug2026', 'from Aug 2026 RBI avg (T21)'], ['fy2526', 'from FY 2025-26 RBI avg (T35)']]],
    ['p0src', 'P0 source', 'select', [['auto', 'Auto (live → yours)'], ['live', 'Live (fetcher)'], ['user', 'Your entry']]],
    ['p0u', 'Your P0, % [USER-ASSUMPTION]', 'number'],
    ['_p0', 'P0 in use', 'text'],
    ['dcur', 'Duty in force on anchor date, % (blank = SSOT schedule)', 'number'],
    ['dnew', 'New duty, % [USER-ASSUMPTION] (blank = unchanged)', 'number'],
    ['world', 'World US$ price change, % [USER-ASSUMPTION]', 'number'],
    ['disc', 'Δ discount / premium, pp [USER-ASSUMPTION]', 'number'],
    ['lic', 'Δ silver licensing, pp [USER-ASSUMPTION]', 'number']
  ];
  var PCT_FIELDS = { p0u: 1, dcur: 1, dnew: 1, world: 1, disc: 1, lic: 1 };
  function buildInputs() {
    var t = $('tb-anchor'); t.replaceChildren();
    var h = t.createTHead().insertRow(); ['Input', 'Gold', 'Silver'].forEach(function (x) { var th = document.createElement('th'); th.textContent = x; h.appendChild(th); });
    var tb = t.createTBody();
    ROWS.forEach(function (r) {
      var tr = tb.insertRow(); tr.insertCell().textContent = r[1];
      METALS.forEach(function (m) {
        var td = tr.insertCell(); td.dataset.m = m; td.dataset.k = r[0];
        if (r[2] === 'text') { td.id = 'in-' + r[0] + '-' + m; return; }
        if (r[0] === 'lic' && m === 'gold') { td.textContent = 'n/a (silver only)'; return; }
        var inp;
        if (r[2] === 'select') { inp = el('select'); r[3].forEach(function (o) { inp.add(new Option(o[1], o[0])); }); }
        else { inp = el('input', { type: r[2] }); if (r[2] === 'number') inp.step = r[0] === 'uv' ? '1' : '0.01'; }
        inp.id = 'in-' + r[0] + '-' + m;
        inp.onchange = function () {
          var v = inp.value, L = F.leg[m];
          if (r[2] === 'number') { v = v === '' ? null : +v; if (v != null && !isFinite(v)) v = null; if (v != null && PCT_FIELDS[r[0]]) v = v / 100; }
          if (r[0] === 'world' || r[0] === 'disc' || r[0] === 'lic') v = v == null ? 0 : v;
          L[r[0]] = v; if (r[0] === 'p0u') { L.p0meta = v == null ? null : { kind: 'USER' }; L.p0note = ''; } UI.rerender();
        };
        td.appendChild(inp);
        if (r[0] === 'p0u') td.appendChild(el('button', { id: 'p0ssot-' + m, text: 'use FY 2025-26 SSOT premium', title: 'Only for the FY 2025-26 benchmark anchor (matched period, before 13 May 2026)', onclick: function () { var B = UI.BENCH.fy2526; F.leg[m].p0u = B.p0[m]; F.leg[m].p0src = 'user'; F.leg[m].p0meta = { kind: 'SSOT', date: B.date, bench: 'fy2526' }; F.leg[m].p0note = ''; UI.rerender(); } }));
      });
    });
  }
  function syncInputs(res) {
    METALS.forEach(function (m) { UI.resolveP0(m, UI.resolveAnchor(m, F.horizon)); }); // G4 re-validation before inputs are synced
    ROWS.forEach(function (r) {
      METALS.forEach(function (m) {
        var inp = $('in-' + r[0] + '-' + m), L = F.leg[m]; if (!inp) return;
        var active = F.metal === 'ratio' || F.metal === m; if (inp.parentNode && inp.parentNode.classList) inp.parentNode.classList.toggle('dim', !active);
        if (r[2] === 'text') return;
        if (document.activeElement === inp) return;
        var v = L[r[0]];
        if (r[2] === 'number') inp.value = v == null ? '' : PCT_FIELDS[r[0]] ? +(v * 100).toFixed(6) : v;
        else inp.value = v == null ? '' : v;
      });
    });
    METALS.forEach(function (m) {
      var a = UI.resolveAnchor(m, F.horizon), p = UI.resolveP0(m, a), d = UI.dutyCur(m, a);
      var ca = $('in-_anchor-' + m); ca.replaceChildren();
      if (!a) ca.appendChild(el('span', { cls: 'nym', text: F.horizon === '1Y' ? 'none' : 'none — 1W/1M need a current spot' }));
      else { ca.appendChild(el('b', { text: UI.rs(a.value) + ' ' })); ca.appendChild(UI.tag(a.kind, a.kind === 'LIVE' ? 'live' : a.kind === 'USER' ? 'ua' : 'ssot')); ca.appendChild(el('div', { cls: 'msg', text: a.label + ' · basis ' + a.basis + ' · date ' + a.date })); }
      var cp = $('in-_p0-' + m); cp.replaceChildren();
      cp.appendChild(document.createTextNode(p.ok ? UI.pct(p.value, 3) + ' ' + (p.tag || '(' + p.source + ')') : 'required'));
      if (!p.ok && F.leg[m].p0note) cp.appendChild(el('div', { cls: 'nym', text: F.leg[m].p0note }));
      cp.appendChild(el('div', { cls: 'msg', text: 'Duty in force: ' + (d.v == null ? 'unknown — enter it' : UI.pct(d.v, 1)) + ' (' + d.src + ')' }));
      var b = $('p0ssot-' + m); if (b) b.disabled = !(a && a.kind === 'SSOT-BENCHMARK' && F.leg[m].bench === 'fy2526');
    });
  }

  function bind() {
    document.querySelectorAll('[data-f]').forEach(function (b) { b.onclick = function () { F[b.dataset.f] = b.dataset.v; UI.rerender(); }; });
    $('fVol').onchange = function () { F.volMode = $('fVol').value; UI.rerender(); };
    $('fPremVar').onchange = function () { F.premVar = $('fPremVar').checked; UI.rerender(); };
    $('fUnit').onchange = function () { F.unit[F.metal] = $('fUnit').value; UI.rerender(); };
    $('fPurity').onchange = function () { F.purity = $('fPurity').value; UI.rerender(); };
    ['1W', '1M', '1Y'].forEach(function (h) { var i = $('lam' + h); i.onchange = function () { var v = +i.value; if (!isFinite(v) || i.value === '') v = E.LAMBDA_DEFAULT[h]; F.lambda[h] = Math.min(1, Math.max(0, v)); UI.rerender(); }; });
    $('fFx').onchange = function () { var v = +$('fFx').value; F.fx = isFinite(v) && $('fFx').value !== '' ? v / 100 : 0; UI.rerender(); };
    $('saveFc').onclick = function () { $('fcMsg').textContent = UI.saveCurrentForecast ? UI.saveCurrentForecast() : ''; };
    $('expFcJ').onclick = function () { UI.download('forecasts_' + UI.stamp() + '.json', JSON.stringify(allHorizons(), null, 1)); };
    $('expFcC').onclick = function () { UI.download('forecasts_' + UI.stamp() + '.csv', UI.toCSV(allHorizons().forecasts.map(function (r) { return UI.flat(r); })), 'text/csv'); };
    $('expScJ').onclick = function () { UI.download('scenario_' + UI.stamp() + '.json', JSON.stringify(scenario(), null, 1)); };
    $('expScC').onclick = function () { var f = UI.flat(scenario()); UI.download('scenario_' + UI.stamp() + '.csv', UI.toCSV(Object.keys(f).map(function (k) { return { key: k, value: f[k] }; })), 'text/csv'); };
    buildInputs();
  }
  function slim(r) {
    if (r.blocked) return { metal: r.metal || F.metal, horizon: r.horizon, blocked: true, banner: r.banner, reason: r.reason };
    return { metal: r.metal, horizon: r.horizon, anchor_value: r.anchorValue, anchor: r.metal === 'ratio' ? { gold: r.legs.gold.anchor, silver: r.legs.silver.anchor } : r.legs[r.metal].anchor,
      bear: r.bear, base: r.base, bull: r.bull, pct_change: r.pctChange, dln: r.dln, dln_world: r.dlnWorld, dln_fx: r.dlnFx, dln_premium: r.dlnPrem, dln_trend: r.dlnTrend,
      sigma: r.sigma, vol_label: r.sigmaInfo && r.sigmaInfo.label, range_label: r.distLabel, residual_code_sanity_only: r.residual, unit: 'gold Rs/10 g · silver Rs/kg · ratio g/g' };
  }
  function allHorizons() { return { generated_utc: new Date().toISOString(), mode: F.mode, note: 'Scenario-conditioned projections; not financial advice.', forecasts: ['1W', '1M', '1Y'].map(function (h) { return slim(UI.run(F.metal, h)); }) }; }
  function scenario() { var s = JSON.parse(JSON.stringify(F)); s.generated_utc = new Date().toISOString(); s.tags = 'All shocks, λ, new duty and P0 entries are [USER-ASSUMPTION]'; return s; }
  UI.slimForecast = slim;

  // ---------------------------------------------------------------- KPIs
  function kpi(box, l, v, s, col, cls) {
    box.appendChild(el('div', { cls: 'kpi', style: 'border-top-color:' + (col || 'var(--c0)') }, [el('div', { cls: 'l', text: l }), el('div', { cls: 'v ' + (cls || ''), text: v }), el('div', { cls: 's', text: s || '' })]));
  }
  function anchorRatio() { var g = UI.resolveAnchor('gold', F.horizon), s = UI.resolveAnchor('silver', F.horizon); return g && s ? g.value * 100 / s.value : null; }

  // ---------------------------------------------------------------- render
  function render() {
    UI.syncGlobal();
    document.querySelectorAll('[data-f]').forEach(function (b) { b.classList.toggle('on', F[b.dataset.f] === b.dataset.v); });
    var us = $('fUnit'); us.replaceChildren(); Object.keys(E.UNITS[F.metal]).forEach(function (k) { us.add(new Option(E.UNITS[F.metal][k].label, k)); }); us.value = F.unit[F.metal];
    var ps = $('fPurity'); if (!ps.options.length) [['asis', 'Purity: as anchored'], ['999', 'Show at 999'], ['995', 'Show at 995']].forEach(function (o) { ps.add(new Option(o[1], o[0])); }); ps.value = F.purity; ps.disabled = F.metal === 'ratio';
    $('fVol').value = F.volMode; $('fPremVar').checked = F.premVar;
    ['1W', '1M', '1Y'].forEach(function (h) { if (document.activeElement !== $('lam' + h)) $('lam' + h).value = F.lambda[h]; });
    if (document.activeElement !== $('fFx')) $('fFx').value = +(F.fx * 100).toFixed(6);
    syncInputs();
    var r = UI.run(F.metal, F.horizon); UI.lastForecast = r;
    var box = $('fcKpis'); box.replaceChildren();
    var notes = $('fcNotes'); notes.replaceChildren(); var note = function (t, tagT, tagC) { var li = el('li'); if (tagT) { li.appendChild(UI.tag(tagT, tagC)); li.appendChild(document.createTextNode(' ')); } li.appendChild(document.createTextNode(t)); notes.appendChild(li); };
    if (r.blocked) {
      UI.banner('fcBanner', 'block', r.banner, r.reason + ' Nothing is computed until this is resolved.');
      kpi(box, 'Projection', 'not computed', r.banner, 'var(--c7)');
    } else {
      UI.banner('fcBanner', '', '');
      var m = F.metal, a = m === 'ratio' ? null : r.legs[m].anchor, basis = a ? a.basis : '', u = UI.unitLabel(m);
      var dv = function (v) { return UI.disp(v, m, basis); };
      if (m === 'ratio') kpi(box, 'Anchor ratio', UI.num(r.anchorValue, 2), 'gold ' + r.legs.gold.anchor.kind + ' ' + r.legs.gold.anchor.date + ' · silver ' + r.legs.silver.anchor.kind + ' ' + r.legs.silver.anchor.date, 'var(--c7)', 'sm');
      else kpi(box, 'Anchor · ' + a.kind, UI.fmtP(dv(a.value), m), u + ' · basis ' + a.basis + ' · ' + a.date, 'var(--c0)', 'sm');
      kpi(box, 'Bear (10th pct)', r.bear == null ? '—' : UI.fmtP(dv(r.bear), m), r.bear == null ? (r.rangeUnavailable || '') : UI.pct(r.bear / r.anchorValue - 1), 'var(--c7)', 'sm');
      kpi(box, 'Base', UI.fmtP(dv(r.base), m), F.horizon + ' · ' + u, 'var(--c2)', 'sm');
      kpi(box, 'Bull (90th pct)', r.bull == null ? '—' : UI.fmtP(dv(r.bull), m), r.bull == null ? '' : UI.pct(r.bull / r.anchorValue - 1), 'var(--c5)', 'sm');
      kpi(box, '% change, base', UI.pct(r.pctChange, 2), 'Δln = ' + UI.lp(r.dln) + ' log-points', '#888', r.pctChange > 0 ? 'up' : r.pctChange < 0 ? 'down' : '');
      if (m !== 'ratio') { var lg = r.legs[m]; kpi(box, 'Premium vs duty', UI.pct(lg.P0, 2) + ' → ' + UI.pct(lg.Ph, 2), 'duty ' + UI.pct(r.inp.dutyCurrent, 1) + ' → ' + UI.pct(r.inp.dutyNew, 1) + ' · λ ' + lg.lambda, 'var(--c4)', 'sm'); }
      else kpi(box, 'Premium path', 'G ' + UI.pct(r.legs.gold.Ph, 2) + ' · S ' + UI.pct(r.legs.silver.Ph, 2), 'from G ' + UI.pct(r.legs.gold.P0, 2) + ' · S ' + UI.pct(r.legs.silver.P0, 2), 'var(--c4)', 'sm');
      var ar = anchorRatio(); kpi(box, 'Gold–silver ratio', ar == null ? '—' : UI.num(ar, 1), ar == null ? 'needs both anchors' : 'from current anchors', 'var(--c7)', 'sm');
      kpi(box, 'Identity residual', r.residual.toExponential(1), 'code-sanity check only: holds by construction, proves nothing about accuracy', 'var(--c6)', 'sm');
    }
    // notes
    if (!r.blocked) {
      note(r.sigmaInfo.available ? 'Volatility: ' + r.sigmaInfo.label + '; σ(' + F.horizon + ') = ' + UI.lp(r.sigma) + ' log-points.' : r.sigmaInfo.reason, F.volMode === 'b' ? '[THEORETICAL — not SSOT]' : null, 'th');
      (r.sigmaInfo.warn || []).forEach(function (w) { note('Warning: ' + w); });
      note('Range: ' + (r.distLabel || 'not available') + '.');
      (r.notes || []).forEach(function (n) { note(n); });
      if (F.metal !== 'ratio' && r.legs[F.metal].anchor.kind === 'SSOT-BENCHMARK') note('1Y starts from an SSOT benchmark (' + r.legs[F.metal].anchor.label + '), not a current spot price.', 'SSOT', 'ssot');
      if (F.purity !== 'asis' && F.metal !== 'ratio' && !E.purityCode(r.legs[F.metal].anchor.basis)) note('Purity scaling not applied: the anchor basis has no stated 999/995 purity (RBI Standard Gold purity is not stated).');
    }
    note('λ = ' + F.lambda[F.horizon] + ' (' + F.horizon + '); defaults 1W 0 · 1M 0.5 · 1Y 1.0.', '[USER-ASSUMPTION — not SSOT-calibrated]', 'ua');
    note('Caution: the duty-to-premium slopes (gold 0.98, silver 0.83) come from yearly averages (FY 2000-01 to 2025-26, n = 26). Pass-through applies only to a duty change you enter; the anchor already contains the duty in force on its date.');
    if (F.trend === 'post1990') note('Trend: post-1990 average (gold ' + UI.lp(E.trendPost1990(DB, 'gold'), 1) + ', silver ' + UI.lp(E.trendPost1990(DB, 'silver'), 1) + ' log-points a year) × T. Long-run averages do not predict short-term direction.');
    else note('Trend: zero (default). Base = anchor + your explicit shocks.');
    note('No inflation, monsoon or festival multipliers are applied after 1990 (post-1990 WPI correlation −0.05 gold, −0.04 silver; correlation is not causation; yearly averages hide seasonality).');
    var dutyNow = r.blocked ? null : (F.metal === 'ratio' ? r.inp.gold.dutyNew : r.inp.dutyNew);
    if (dutyNow != null && dutyNow >= 0.10) note('High-duty fact note (information only): NITI Aayog found higher duty shifts imports to unofficial channels; customs seizures rose from 2,155 kg (2020) to 3,502 kg (2022); [NG] WGC reports a post-May-2026 domestic discount and unofficial inflows.');
    note('Scenario-conditioned projection and measured accuracy only. This is not financial advice and not a recommendation to transact.');
    fan(r); waterfall(r);
  }

  // ---------------------------------------------------------------- fan chart
  function frame(id, H, ml) {
    var c = $(id); c.replaceChildren(); var W = Math.max(280, c.clientWidth);
    var svg = d3.select(c).append('svg').attr('width', W).attr('height', H).attr('role', 'img');
    var m = { l: ml || 64, r: 14, t: 16, b: 30 }; return { svg: svg, W: W, H: H, m: m, iw: W - m.l - m.r, ih: H - m.t - m.b, g: svg.append('g').attr('transform', 'translate(' + m.l + ',' + m.t + ')') };
  }
  UI.frame = frame;
  var D = function (s) { return new Date(s + 'T00:00:00Z'); };
  function history(m) {
    var ann = [], mon = [], pts = [];
    if (m === 'ratio') {
      DB.master_yearly.forEach(function (r) { if (String(r.gold_value_type).indexOf('RBI FY') === 0 && r.gold_silver_ratio != null) ann.push({ d: D((+r.fiscal_year.slice(0, 4)) + '-10-01'), v: r.gold_silver_ratio, l: r.fiscal_year + ' RBI FY avg ratio' }); });
      DB.monthly_2025_2026.forEach(function (r) { if (r.ratio_DERIVED != null) mon.push({ d: D(r.month + '-15'), v: r.ratio_DERIVED, l: r.month + ' ratio (DERIVED)' }); });
    } else {
      E.annualSeries(DB, m).forEach(function (r) { ann.push({ d: D((+r.fy.slice(0, 4)) + '-10-01'), v: r.value, l: r.fy + ' RBI FY average' }); });
      E.monthlySeries(DB, m).forEach(function (r) { mon.push({ d: D(r.month + '-15'), v: r.value, l: r.month + ' RBI monthly average' }); });
      var LD = UI.legacyData || (UI.legacyData = window.LEGACY_DATA_FROM_SSOT(DB));
      LD.pre1970_points.filter(function (p) { return p.metal === m; }).forEach(function (p) {
        var y = Math.floor(p.x), dd = new Date(Date.UTC(y, 0, 1) + (p.x - y) * 365.25 * 864e5);
        pts.push({ d: dd, v: p.value, l: p.date + ': ' + p.original + ' — ' + p.basis + ' (dated point, not an annual average)' });
      });
    }
    return { ann: ann, mon: mon, pts: pts };
  }
  function fan(r) {
    var m = F.metal, span = F.span === 'auto' ? (F.horizon === '1Y' ? 'long' : 'zoom') : F.span, H = history(m);
    var lg = $('lg-fan'); lg.replaceChildren();
    var col = m === 'gold' ? 'var(--c0)' : m === 'silver' ? 'var(--c1)' : 'var(--c7)';
    [['RBI FY average', col, ''], ['RBI monthly average', col, 'opacity:.55'], ['Dated pre-1970 point / minister\'s figure (†: non-govt mirror)', '', 'ring'], ['Projection 10–90 band', 'var(--band)', ''], ['GAP', 'var(--gapfill)', '']].forEach(function (x) {
      var i = el('i'); if (x[2] === 'ring') i.className = 'ring'; else { i.style.background = x[1]; if (x[2]) i.setAttribute('style', 'background:' + x[1] + ';' + x[2]); }
      if (x[2] === 'ring') i.style.borderColor = col; lg.appendChild(el('span', {}, [i, x[0]]));
    });
    $('t-fan').textContent = (m === 'ratio' ? 'Gold–silver ratio' : (m === 'gold' ? 'Gold' : 'Silver') + ', ' + UI.unitLabel(m)) + ': projection fan joined to SSOT history';
    var anchorDate = null, fanPts = [];
    if (!r.blocked) {
      var ad = m === 'ratio' ? (r.legs.gold.anchor.date > r.legs.silver.anchor.date ? r.legs.gold.anchor.date : r.legs.silver.anchor.date) : r.legs[m].anchor.date;
      anchorDate = D(/^\d{4}-\d{2}-\d{2}$/.test(ad) ? ad : '2026-11-20');
      var days = { '1W': 7, '1M': 30.44, '1Y': 365.25 }[F.horizon], basis = m === 'ratio' ? '' : r.legs[m].anchor.basis;
      for (var k = 0; k <= 24; k++) {
        var f = k / 24, dd = new Date(anchorDate.getTime() + f * days * 864e5), b = r.anchorValue * Math.exp(r.mu * f);
        var lo = r.bear == null ? null : b * Math.pow(r.bear / r.base, Math.sqrt(f)), hi = r.bull == null ? null : b * Math.pow(r.bull / r.base, Math.sqrt(f));
        fanPts.push({ d: dd, b: UI.disp(b, m, basis), lo: lo == null ? null : UI.disp(lo, m, basis), hi: hi == null ? null : UI.disp(hi, m, basis) });
      }
    }
    var x0 = span === 'long' ? D('1946-04-01') : span === 'zoom' && anchorDate ? new Date(anchorDate.getTime() - 150 * 864e5) : D('2025-01-01'), x1 = fanPts.length ? new Date(Math.max(fanPts[fanPts.length - 1].d.getTime(), D('2026-12-01').getTime())) : D('2026-12-31');
    x1 = new Date(x1.getTime() + (x1 - x0) * 0.03);
    var cv = function (v) { return m === 'ratio' ? v : E.toUnit(v, m, F.unit[m]); };
    var hist = H.ann.concat(H.mon).concat(span === 'long' ? H.pts : []).filter(function (p) { return p.d >= x0; }).map(function (p) { return { d: p.d, v: cv(p.v), l: p.l, src: p }; });
    var vals = hist.map(function (p) { return p.v; }).concat(fanPts.map(function (p) { return p.b; })).concat(fanPts.filter(function (p) { return p.lo != null; }).flatMap(function (p) { return [p.lo, p.hi]; }));
    if (!vals.length) return;
    var log = F.fscale === 'log', y = log ? d3.scaleLog().domain([d3.min(vals) / 1.3, d3.max(vals) * 1.25]) : d3.scaleLinear().domain([0, d3.max(vals) * 1.1]);
    var Fm = frame('c-fan', 400, 78); y.range([Fm.ih, 0]); if (!log) y.nice();
    var x = d3.scaleUtc().domain([x0, x1]).range([0, Fm.iw]);
    var fmt = m === 'ratio' ? function (v) { return d3.format('~r')(v); } : function (v) { return v >= 1e5 ? d3.format('~r')(v / 1e5) + ' lakh' : d3.format(',~r')(v); };
    var dom = y.domain(), yt;
    if (log && dom[1] / dom[0] > 20) { yt = []; [1, 2, 5].forEach(function (k) { for (var e = 0; e < 8; e++) yt.push(k * Math.pow(10, e)); }); yt = yt.filter(function (v) { return v >= dom[0] && v <= dom[1]; }).sort(function (a, b) { return a - b; }); }
    else yt = d3.scaleLinear().domain(dom).ticks(5).filter(function (v) { return v > 0; });
    Fm.g.append('g').attr('class', 'gridl').call(d3.axisLeft(y).tickValues(yt).tickSize(-Fm.iw).tickFormat(''));
    Fm.g.append('g').call(d3.axisLeft(y).tickValues(yt).tickFormat(fmt).tickSize(0).tickPadding(7)).call(function (a) { a.select('.domain').remove(); });
    Fm.g.append('g').attr('transform', 'translate(0,' + Fm.ih + ')').call(d3.axisBottom(x).ticks(Fm.W < 520 ? 4 : 8).tickSizeOuter(0));
    // GAP bands
    var gaps = [];
    if (span === 'long' && m !== 'ratio') gaps.push([D('1946-04-01'), D('1970-04-01'), m === 'gold' ? 'GAP: no annual gold average 1946-47 to 1969-70 (dated points only)' : 'No RBI annual series before 1970-71 († FY averages from a non-govt mirror shown as points)']);
    if (span === 'long' && m === 'ratio') gaps.push([D('1946-04-01'), D('1970-04-01'), 'GAP: no annual ratio before 1970-71']);
    gaps.push([D('2026-09-01'), D('2026-12-01'), 'GAP: RBI monthly averages Sep–Nov 2026 not published']);
    gaps.forEach(function (g) {
      var a = Math.max(0, x(g[0])), b = Math.min(Fm.iw, x(g[1])); if (b <= a) return;
      Fm.g.append('rect').attr('x', a).attr('width', b - a).attr('height', Fm.ih).attr('fill', UI.colorVar('gapfill')).lower()
        .on('mousemove', function (ev) { UI.showTip(ev, ['GAP', g[2]]); }).on('mouseleave', UI.hideTip);
    });
    // regime markers
    var rm = REGIMES.filter(function (q) { var d = D(q[0]); return d >= x0 && d <= x1; });
    var lastX = -1e9, row = 0;
    rm.forEach(function (q) {
      var xx = x(D(q[0])); row = xx - lastX < 70 ? (row + 1) % 3 : 0; lastX = xx;
      Fm.g.append('line').attr('x1', xx).attr('x2', xx).attr('y1', 0).attr('y2', Fm.ih).attr('stroke', UI.colorVar('c6')).attr('stroke-dasharray', '3 3').attr('stroke-width', 1);
      Fm.g.append('text').attr('class', 'labm').attr('x', xx + 3).attr('y', 10 + row * 12).style('font-size', '10px').text(q[2]);
      Fm.g.append('rect').attr('x', xx - 4).attr('width', 8).attr('height', Fm.ih).attr('fill', 'transparent').on('mousemove', function (ev) { UI.showTip(ev, ['Regime marker', q[1], q[0]]); }).on('mouseleave', UI.hideTip);
    });
    var line = d3.line().x(function (p) { return x(p.d); }).y(function (p) { return y(p.v); });
    var annH = hist.filter(function (p) { return H.ann.indexOf(p.src) >= 0; }), monH = hist.filter(function (p) { return H.mon.indexOf(p.src) >= 0; }), ptH = hist.filter(function (p) { return H.pts.indexOf(p.src) >= 0; });
    var c = m === 'gold' ? UI.colorVar('c0') : m === 'silver' ? UI.colorVar('c1') : UI.colorVar('c7');
    Fm.g.append('path').datum(annH).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 2).attr('d', line);
    Fm.g.append('path').datum(monH).attr('fill', 'none').attr('stroke', c).attr('stroke-width', 1.6).attr('opacity', 0.6).attr('d', line);
    Fm.g.selectAll('.hp').data(annH.concat(monH)).join('circle').attr('cx', function (p) { return x(p.d); }).attr('cy', function (p) { return y(p.v); }).attr('r', 2.4).attr('fill', c)
      .on('mousemove', function (ev, p) { UI.showTip(ev, [p.l, UI.fmtP(p.v, m) + ' ' + UI.unitLabel(m), 'SSOT (F1)']); }).on('mouseleave', UI.hideTip);
    Fm.g.selectAll('.pp').data(ptH).join('circle').attr('cx', function (p) { return x(p.d); }).attr('cy', function (p) { return y(p.v); }).attr('r', 4).attr('fill', UI.colorVar('panel')).attr('stroke', c).attr('stroke-width', 2)
      .on('mousemove', function (ev, p) { UI.showTip(ev, [p.l, UI.fmtP(p.v, m) + ' ' + UI.unitLabel(m)]); }).on('mouseleave', UI.hideTip);
    if (fanPts.length) {
      if (fanPts[0].lo != null) Fm.g.append('path').datum(fanPts).attr('fill', m === 'silver' ? UI.colorVar('bandS') : UI.colorVar('band')).attr('stroke', 'none')
        .attr('d', d3.area().x(function (p) { return x(p.d); }).y0(function (p) { return y(p.lo); }).y1(function (p) { return y(p.hi); }));
      Fm.g.append('path').datum(fanPts).attr('fill', 'none').attr('stroke', UI.colorVar('c2')).attr('stroke-width', 2.2).attr('d', d3.line().x(function (p) { return x(p.d); }).y(function (p) { return y(p.b); }));
      var A0 = fanPts[0], Z = fanPts[fanPts.length - 1];
      Fm.g.append('circle').attr('cx', x(A0.d)).attr('cy', y(A0.b)).attr('r', 5).attr('fill', UI.colorVar('hi')).attr('stroke', UI.colorVar('panel')).attr('stroke-width', 2)
        .on('mousemove', function (ev) { UI.showTip(ev, ['Anchor', UI.fmtP(A0.b, m) + ' ' + UI.unitLabel(m), m === 'ratio' ? 'gold ÷ silver anchors' : r.legs[m].anchor.label]); }).on('mouseleave', UI.hideTip);
      if (Fm.W >= 560) Fm.g.append('text').attr('class', 'lab').attr('x', x(A0.d) - 8).attr('y', (Z.lo != null ? y(Z.lo) : y(Z.b)) + 16).attr('text-anchor', 'end').text(F.horizon + ' base ' + UI.fmtP(Z.b, m) + (Z.lo != null ? ' (' + UI.fmtP(Z.lo, m) + ' – ' + UI.fmtP(Z.hi, m) + ')' : ''));
      if (Z.lo != null) Fm.g.append('rect').attr('x', x(A0.d) - 4).attr('width', Math.max(8, x(Z.d) - x(A0.d) + 8)).attr('y', y(Z.hi) - 4).attr('height', Math.max(8, y(Z.lo) - y(Z.hi) + 8)).attr('fill', 'transparent')
        .on('mousemove', function (ev) { UI.showTip(ev, [F.horizon + ' projection (' + F.metal + ')', 'Bull ' + UI.fmtP(Z.hi, m), 'Base ' + UI.fmtP(Z.b, m), 'Bear ' + UI.fmtP(Z.lo, m), 'Scenario-conditioned; not advice']); }).on('mouseleave', UI.hideTip);
    }
    $('d-fan').textContent = 'Band: 10th–90th percentile range' + (r.blocked ? ' (not computed: ' + r.banner + ')' : '') + '. Grey bands: GAP (no government figure). Dashed lines: regime markers — ' + REGIMES.map(function (q) { return q[1]; }).join('; ') + '. History is RBI Standard Gold / RBI silver, unscaled for purity; 2026-27 YTD is not shown as an annual average.';
  }

  // ---------------------------------------------------------------- waterfall
  var nf = function (v) { return 'Rs ' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(v); };
  function waterfall(r) {
    var c = $('c-wf'); if (r.blocked) { c.replaceChildren(el('p', { cls: 'd', text: 'Not computed: ' + r.banner + '.' })); return; }
    var steps = [['World US$', r.dlnWorld, 'c2'], ['Rupee', r.dlnFx, 'c3'], ['Duty pass-through', r.dlnPremDuty, 'c4'], ['Offsets (pp)', r.dlnPremOffsets, 'c6'], ['Trend', r.dlnTrend, 'c5']];
    var cum = 0, bars = [], A = r.anchorValue, m = F.metal, basis = m === 'ratio' ? '' : r.legs[m].anchor.basis;
    steps.forEach(function (s) { var a = cum; cum += s[1]; bars.push({ n: s[0], a: a, b: cum, v: s[1], col: s[2], rs: UI.disp(A * Math.exp(cum), m, basis) - UI.disp(A * Math.exp(a), m, basis) }); });
    bars.push({ n: 'Total', a: 0, b: cum, v: cum, col: 'ink', rs: UI.disp(A * Math.exp(cum), m, basis) - UI.disp(A, m, basis), tot: true });
    var ext = d3.extent(bars.flatMap(function (b) { return [b.a * 100, b.b * 100]; }).concat([0]));
    if (ext[0] === ext[1]) ext = [-1, 1];
    var Fm = frame('c-wf', 290, 50); Fm.g.attr('transform', 'translate(' + Fm.m.l + ',' + (Fm.m.t + 22) + ')'); Fm.ih -= 22; var y = d3.scaleLinear().domain(ext).nice().range([Fm.ih, 0]), x = d3.scaleBand().domain(bars.map(function (b) { return b.n; })).range([0, Fm.iw]).padding(0.25);
    Fm.g.append('g').attr('class', 'gridl').call(d3.axisLeft(y).ticks(5).tickSize(-Fm.iw).tickFormat(''));
    Fm.g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(function (v) { return (v > 0 ? '+' : '') + v; }).tickSize(0).tickPadding(6)).call(function (a) { a.select('.domain').remove(); });
    Fm.g.append('g').attr('transform', 'translate(0,' + Fm.ih + ')').call(d3.axisBottom(x).tickSizeOuter(0)).selectAll('text').style('font-size', Fm.W < 480 ? '9px' : '11px');
    Fm.g.append('line').attr('x1', 0).attr('x2', Fm.iw).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', UI.colorVar('zero'));
    bars.forEach(function (b) {
      var top = y(Math.max(b.a, b.b) * 100), h = Math.max(1, Math.abs(y(b.a * 100) - y(b.b * 100)));
      Fm.g.append('rect').attr('x', x(b.n)).attr('width', x.bandwidth()).attr('y', top).attr('height', h).attr('rx', 2).attr('fill', UI.colorVar(b.col))
        .on('mousemove', function (ev) { UI.showTip(ev, [b.n, UI.lp(b.v) + ' log-points', (m === 'ratio' ? 'ratio ' : '') + (b.rs >= 0 ? '+' : '−') + (m === 'ratio' ? UI.num(Math.abs(b.rs), 2) : UI.rs(Math.abs(b.rs)))]); }).on('mouseleave', UI.hideTip);
      Fm.g.append('text').attr('class', 'wfl').attr('x', x(b.n) + x.bandwidth() / 2).attr('y', top - 16).attr('text-anchor', 'middle').text(UI.lp(b.v, 2) + ' lp');
      Fm.g.append('text').attr('class', 'wfl').attr('x', x(b.n) + x.bandwidth() / 2).attr('y', top - 4).attr('text-anchor', 'middle').style('font-size', Fm.W < 480 ? '8.5px' : '10px').text((b.rs >= 0 ? '+' : '−') + (m === 'ratio' ? UI.num(Math.abs(b.rs), 2) : nf(Math.abs(b.rs))));
    });
  }

  window.UIPAGES.forecast = [render];
  UI.bindForecast = bind;
})();
