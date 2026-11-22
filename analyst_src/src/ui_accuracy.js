/* Accuracy Lab: achievability meter, walk-forward backtests vs no-change, naive benchmark, live scorecard. */
(function () {
  'use strict';
  var UI = window.UI, E = UI.E, DB = UI.DB, $ = UI.$, el = UI.el, F = UI.F;
  var KEY = 'bullion_scorecard_v1';
  var SPEC_NAIVE = { gold: { m1: 0.89, y_all: 0.53, y_post1990: 0.53, y_last10: 0.40 }, silver: { m1: 0.74, y_all: 0.55, y_post1990: 0.53, y_last10: 0.30 } };
  UI.SC = [];
  function load() { try { var s = localStorage.getItem(KEY); UI.SC = s ? JSON.parse(s) : []; if (!Array.isArray(UI.SC)) UI.SC = []; } catch (e) { UI.SC = []; } }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(UI.SC)); return true; } catch (e) { return false; } }
  UI.scoreAll = function () { var h = UI.hist(); if (!h) return; UI.SC = E.scoreForecasts(UI.SC, h, F.tol).map(function (e) { return e.status === 'SCORED' && !e.scored_from ? Object.assign({}, e, { scored_from: 'LIVE history' }) : e; }); save(); };
  var liveAnchored = function (e) { var i = e.inputs || {}, k = String(e.anchor && e.anchor.kind || ''); return /LIVE/.test(k) || i.P0Source === 'live' || (i.gold && i.gold.P0Source === 'live') || (i.silver && i.silver.P0Source === 'live'); };
  /** G2: in Mode A, entries anchored to live data are excluded and live-derived scores are blanked (storage keeps them for Mode B). */
  UI.visibleSC = function () {
    if (UI.liveOn()) return { rows: UI.SC.slice(), hidden: 0, blanked: 0 };
    var hidden = 0, blanked = 0, rows = [];
    UI.SC.forEach(function (e) {
      if (liveAnchored(e)) { hidden++; return; }
      if (e.status === 'SCORED') { blanked++; var c = {}; Object.keys(e).forEach(function (k) { if (['actual', 'actual_date', 'err', 'hit', 'in_range', 'naive_err', 'naive_hit', 'scored_from'].indexOf(k) < 0) c[k] = e[k]; }); c.status = 'PENDING (live-derived score hidden in Mode A)'; rows.push(c); return; }
      rows.push(e);
    });
    return { rows: rows, hidden: hidden, blanked: blanked };
  };
  UI.saveCurrentForecast = function () {
    var r = UI.lastForecast; if (!r || r.blocked) return 'Nothing to save: ' + (r ? r.banner : 'no forecast') + '.';
    var a = r.metal === 'ratio' ? { value: r.anchorValue, date: r.legs.gold.anchor.date > r.legs.silver.anchor.date ? r.legs.gold.anchor.date : r.legs.silver.anchor.date, basis: 'ratio of anchors', kind: r.legs.gold.anchor.kind + '/' + r.legs.silver.anchor.kind } : r.legs[r.metal].anchor;
    var days = { '1W': 7, '1M': 30, '1Y': 365 }[r.horizon], td = /^\d{4}-\d{2}-\d{2}$/.test(a.date) ? new Date(new Date(a.date + 'T00:00:00Z').getTime() + days * 864e5).toISOString().slice(0, 10) : null;
    if (!td) return 'Anchor date is not a calendar date; cannot schedule scoring.';
    var inp = JSON.parse(JSON.stringify(r.inp)); delete inp.live;
    UI.SC.push({ id: 'F' + Date.now().toString(36), saved_at_utc: new Date().toISOString(), mode: F.mode, metal: r.metal, horizon: r.horizon,
      anchor: { value: a.value, date: a.date, basis: a.basis, kind: a.kind }, target_date: td, base: r.base, bear: r.bear, bull: r.bull, tol: F.tol, sigma: r.sigma, vol: r.sigmaInfo && r.sigmaInfo.label, inputs: inp, status: 'PENDING' });
    if (UI.hist()) UI.scoreAll();
    var ok = save(); UI.rerender();
    return 'Saved ' + r.metal + ' ' + r.horizon + ' forecast; scored automatically when a live_history.json with a price on or after ' + td + ' is loaded.' + (ok ? '' : ' (Browser storage unavailable: export the scorecard to keep it.)');
  };

  function bt() {
    var tol = F.tol, h = UI.hist(), out = {};
    ['gold', 'silver'].forEach(function (m) {
      out[m] = { y: E.backtestYearly(DB, m, { tol: tol }), mo: E.backtestMonthly(DB, m, { tol: tol }), lw: E.backtestLive(h || { series: [] }, m, '1W', { tol: tol }), lm: E.backtestLive(h || { series: [] }, m, '1M', { tol: tol }) };
    });
    return out;
  }
  var P = function (v, d) { return v == null || !isFinite(v) ? '—' : (v * 100).toFixed(d == null ? 1 : d) + '%'; };

  function meter(B) {
    var tol = F.tol, tgt = F.target, m = F.metal, lv = UI.liveVol(), rows = [];
    ['1W', '1M', '1Y'].forEach(function (hz) {
      ['a', 'b', 'c'].forEach(function (vm) {
        var s = E.sigmaFor(DB, m, hz, vm, F.premVar, lv), a = s.available ? E.achievability(s.sigma, tol, tgt) : null;
        var bk = '—', nv = '—';
        if (m !== 'ratio') {
          var d = hz === '1Y' ? B[m].y : hz === '1M' ? B[m].mo : B[m].lw;
          if (hz === '1W') { bk = E.NYM + ' (live n = ' + d.n + ' of ' + d.min + ')'; nv = E.NYM; }
          else { var sm = d.summary; bk = P(sm.M1.hitRate) + ' M1 (n = ' + sm.M1.n + ')' + (hz === '1M' ? ' · averages, indicative' : ' · yearly averages'); nv = P(sm.M0.hitRate) + ' (n = ' + sm.M0.n + ')'; if (hz === '1M') { var l = B[m].lm; bk += ' · live: ' + (l.status === 'OK' ? P(l.summary.M0.hitRate) : E.NYM); } }
        } else { bk = 'not backtested for the ratio'; nv = '—'; }
        rows.push({ hz: hz, vm: vm, s: s, a: a, bk: bk, nv: nv });
      });
    });
    UI.table('tb-meter', [
      { h: 'Horizon', f: function (r) { return r.hz; } }, { h: 'Volatility', f: function (r) { return r.vm === 'b' ? '(b) [THEORETICAL — not SSOT]' : r.vm === 'a' ? '(a) SSOT annual' : '(c) realised live'; } },
      { h: 'σ (log-pts)', n: 1, f: function (r) { return r.s.available ? UI.lp(r.s.sigma, 2).replace('+', '') : '—'; } },
      { h: 'P(|actual/forecast − 1| ≤ ' + (tol * 100).toFixed(1) + '%)', n: 1, f: function (r) { return r.a ? P(r.a.p) : 'unavailable'; } },
      { h: 'vs target ' + (tgt * 100).toFixed(0) + '%', f: function (r) { if (!r.a) return el('span', { cls: 'msg', text: r.s.reason }); return el('span', { cls: r.a.label === 'achievable' ? 'meter-a' : r.a.label === 'borderline' ? 'meter-b' : 'meter-n', text: r.a.label + (r.s.warn && r.s.warn.length ? ' *' : '') }); } },
      { h: 'Backtested hit rate', f: function (r) { return r.bk; } }, { h: 'No-change benchmark', f: function (r) { return r.nv; } }
    ], rows);
    $('aCaption').textContent = E.CAPTION_ACHIEVE + ' * annual averages smooth spot moves and understate short-term risk at 1W/1M. Backtested rates are on RBI averages, not spot.';
    $('aMetal').textContent = m === 'ratio' ? 'gold–silver ratio (set on the Forecast page)' : m + ' (set on the Forecast page)';
  }
  function tables(B) {
    var box = $('accTables'); box.replaceChildren();
    ['gold', 'silver'].forEach(function (m) {
      [['y', 'SSOT yearly, 1Y'], ['mo', 'SSOT monthly, 1M'], ['lw', 'Live daily history, 1W'], ['lm', 'Live daily history, 1M']].forEach(function (k) {
        var d = B[m][k[0]];
        box.appendChild(el('h2', { text: (m === 'gold' ? 'Gold' : 'Silver') + ' · ' + k[1] + ' · n = ' + d.n + (d.label ? ' · ' + d.label : '') }));
        if (!d.summary) { box.appendChild(el('p', {}, [el('span', { cls: 'nym', text: E.NYM }), document.createTextNode(' — ' + d.n + ' non-overlapping test points; at least ' + d.min + ' required. No number is shown below the minimum sample.')])); return; }
        var t = el('table'); box.appendChild(el('div', { cls: 'tw' }, [t])); t.id = 'tb-bt-' + m + '-' + k[0];
        var rows = Object.keys(d.summary).map(function (mm) { var s = d.summary[mm]; s.model = mm; return s; });
        UI.table(t.id, [
          { h: 'Model', f: function (s) { return { M0: 'M0 no-change', M1: 'M1 expanding trend', M2: 'M2 M1 + known duty', M3: 'M3 range check' }[s.model]; } }, { h: 'n', n: 1, f: function (s) { return s.n; } },
          { h: 'Hit rate ±' + (d.tol * 100).toFixed(1) + '%', n: 1, f: function (s) { return P(s.hitRate); } }, { h: 'No-change hit rate (n)', n: 1, f: function (s) { return P(s.naive.hitRate) + ' (' + s.naive.n + ')'; } },
          { h: 'MAE', n: 1, f: function (s) { return P(s.mae, 2); } }, { h: 'No-change MAE', n: 1, f: function (s) { return P(s.naive.mae, 2); } },
          { h: '10–90 coverage (target 80%)', n: 1, f: function (s) { return s.coverage == null ? '—' : P(s.coverage) + ' (' + s.nCoverage + ')'; } },
          { h: 'Skill vs M0', n: 1, f: function (s) { return s.skill == null ? '—' : s.skill.toFixed(2); } }
        ], rows);
      });
    });
  }
  function naive() {
    var nb = E.naiveBenchmarks(DB, F.tol), rows = [];
    ['gold', 'silver'].forEach(function (m) { rows.push({ m: m, d: nb[m] }); });
    var c = function (k) { return function (r) { var x = r.d[k], s = P(x.rate, 0) + ' (n = ' + x.n + ')'; if (Math.abs(F.tol - 0.10) < 1e-9) { var ref = SPEC_NAIVE[r.m][k]; s += Math.round(x.rate * 100) === Math.round(ref * 100) ? ' ✓ §2' : ' ≠ §2 ' + P(ref, 0) + ' (F1 wins)'; } return s; }; };
    UI.table('tb-naive', [{ h: 'Metal', f: function (r) { return r.m; } }, { h: '1M (2025–26 monthly)', f: c('m1') }, { h: '1Y all years', f: c('y_all') }, { h: '1Y post-1990', f: c('y_post1990') }, { h: '1Y last 10', f: c('y_last10') }], rows);
  }
  function chartHits(B) {
    var groups = [];
    ['gold', 'silver'].forEach(function (m) { [['y', '1Y yearly'], ['mo', '1M monthly*']].forEach(function (k) { var s = B[m][k[0]].summary; groups.push({ g: (m === 'gold' ? 'Gold ' : 'Silver ') + k[1], bars: ['M0', 'M1', 'M2'].map(function (mm) { return { m: mm, v: s[mm].hitRate, n: s[mm].n }; }) }); }); });
    ['gold', 'silver'].forEach(function (m) { groups.push({ g: (m === 'gold' ? 'Gold' : 'Silver') + ' 1W live', nym: B[m].lw.n + '/' + B[m].lw.min }); });
    var Fm = UI.frame('c-acc', 250, 44), x = d3.scaleBand().domain(groups.map(function (g) { return g.g; })).range([0, Fm.iw]).padding(0.2), y = d3.scaleLinear().domain([0, 1]).range([Fm.ih, 0]);
    var xb = d3.scaleBand().domain(['M0', 'M1', 'M2']).range([0, x.bandwidth()]).padding(0.12);
    Fm.g.append('g').attr('class', 'gridl').call(d3.axisLeft(y).ticks(5).tickSize(-Fm.iw).tickFormat(''));
    Fm.g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('.0%')).tickSize(0).tickPadding(6)).call(function (a) { a.select('.domain').remove(); });
    Fm.g.append('g').attr('transform', 'translate(0,' + Fm.ih + ')').call(d3.axisBottom(x).tickSizeOuter(0)).selectAll('text').style('font-size', Fm.W < 520 ? '8px' : '11px');
    Fm.g.append('line').attr('x1', 0).attr('x2', Fm.iw).attr('y1', y(F.target)).attr('y2', y(F.target)).attr('stroke', UI.colorVar('c7')).attr('stroke-dasharray', '4 3');
    Fm.g.append('text').attr('class', 'labm').attr('x', Fm.iw).attr('y', y(F.target) - 4).attr('text-anchor', 'end').text('target ' + (F.target * 100).toFixed(0) + '%');
    groups.forEach(function (g) {
      var gx = x(g.g);
      if (g.nym) { Fm.g.append('text').attr('class', 'labm').attr('x', gx + x.bandwidth() / 2).attr('y', Fm.ih - 8).attr('text-anchor', 'middle').style('font-size', '9.5px').text('NOT YET'); Fm.g.append('text').attr('class', 'labm').attr('x', gx + x.bandwidth() / 2).attr('y', Fm.ih - 20).attr('text-anchor', 'middle').style('font-size', '9.5px').text('n ' + g.nym); return; }
      g.bars.forEach(function (b) {
        Fm.g.append('rect').attr('x', gx + xb(b.m)).attr('width', xb.bandwidth()).attr('y', y(b.v)).attr('height', Fm.ih - y(b.v)).attr('fill', b.m === 'M0' ? UI.colorVar('muted') : b.m === 'M1' ? UI.colorVar('c0') : UI.colorVar('c6'))
          .on('mousemove', function (ev) { UI.showTip(ev, [g.g + ' · ' + b.m, 'Hit rate ' + P(b.v) + ' (n = ' + b.n + ')', 'No-change: ' + P(g.bars[0].v) + ' (n = ' + g.bars[0].n + ')']); }).on('mouseleave', UI.hideTip);
        if (xb.bandwidth() > 16) Fm.g.append('text').attr('class', 'wfl').attr('x', gx + xb(b.m) + xb.bandwidth() / 2).attr('y', y(b.v) - 3).attr('text-anchor', 'middle').style('font-size', '9px').text(b.m);
      });
      Fm.g.append('text').attr('class', 'labm').attr('x', gx + x.bandwidth() / 2).attr('y', Fm.ih + 28).attr('text-anchor', 'middle').style('font-size', '9.5px').text('n = ' + g.bars[0].n);
    });
  }
  function chartErr(B) {
    var m = F.metal === 'silver' ? 'silver' : 'gold', pts = B[m].y.points, tol = B[m].y.tol;
    var data = pts.map(function (p) { return { s: +p.target.slice(0, 4), fy: p.target, e0: p.actual / p.f.M0 - 1, e1: p.actual / p.f.M1 - 1 }; });
    var ext = d3.extent(data.flatMap(function (d) { return [d.e0, d.e1]; }).concat([-tol, tol]));
    var Fm = UI.frame('c-accerr', 250, 48), x = d3.scaleLinear().domain(d3.extent(data, function (d) { return d.s; })).range([0, Fm.iw]), y = d3.scaleLinear().domain(ext).nice().range([Fm.ih, 0]);
    Fm.g.append('rect').attr('x', 0).attr('width', Fm.iw).attr('y', y(tol)).attr('height', y(-tol) - y(tol)).attr('fill', UI.colorVar('gapfill'));
    Fm.g.append('g').call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('+.0%')).tickSize(0).tickPadding(6)).call(function (a) { a.select('.domain').remove(); });
    Fm.g.append('g').attr('transform', 'translate(0,' + Fm.ih + ')').call(d3.axisBottom(x).ticks(6).tickFormat(d3.format('d')).tickSizeOuter(0));
    [['e0', 'muted'], ['e1', 'c0']].forEach(function (k) { Fm.g.append('path').datum(data).attr('fill', 'none').attr('stroke', UI.colorVar(k[1])).attr('stroke-width', 1.8).attr('d', d3.line().x(function (d) { return x(d.s); }).y(function (d) { return y(d[k[0]]); })); });
    Fm.g.selectAll('.ep').data(data).join('circle').attr('cx', function (d) { return x(d.s); }).attr('cy', function (d) { return y(d.e1); }).attr('r', 2.5).attr('fill', UI.colorVar('c0'))
      .on('mousemove', function (ev, d) { UI.showTip(ev, [d.fy + ' (' + m + ')', 'M1 error ' + UI.pct(d.e1), 'No-change error ' + UI.pct(d.e0)]); }).on('mouseleave', UI.hideTip);
    Fm.svg.append('text').attr('class', 'labm').attr('x', Fm.W - 6).attr('y', 12).attr('text-anchor', 'end').text(m + ': grey line M0, blue M1');
  }
  function scorecard() {
    var sum = $('scSum'); sum.replaceChildren(); var V = UI.visibleSC();
    if (V.hidden || V.blanked) sum.appendChild(el('p', { cls: 'msg', text: 'Mode A: ' + V.hidden + ' live-anchored entr' + (V.hidden === 1 ? 'y' : 'ies') + ' hidden and ' + V.blanked + ' live-derived score' + (V.blanked === 1 ? '' : 's') + ' blanked (kept in storage; shown again in Mode B with live files loaded).' }));
    ['1W', '1M', '1Y'].forEach(function (hz) {
      var s = E.scorecardSummary(V.rows, hz);
      sum.appendChild(el('div', {}, [el('b', { text: hz + ': ' }), s.status === 'OK' ? document.createTextNode('hit rate ' + P(s.hitRate) + ' vs no-change ' + P(s.naiveHitRate) + ' · range coverage ' + P(s.coverage) + ' · n = ' + s.n) : el('span', { cls: 'nym', text: E.NYM + ' (scored n = ' + s.n + ' of ' + s.min + ')' })]));
    });
    UI.table('tb-sc', [
      { h: 'Saved (UTC)', f: function (e) { return e.saved_at_utc.slice(0, 16).replace('T', ' '); } }, { h: 'Metal', f: function (e) { return e.metal; } }, { h: 'H', f: function (e) { return e.horizon; } },
      { h: 'Anchor', f: function (e) { return UI.fmtP(e.anchor.value, e.metal) + ' · ' + e.anchor.kind + ' · ' + e.anchor.date; } }, { h: 'Target date', f: function (e) { return e.target_date; } },
      { h: 'Bear / Base / Bull', f: function (e) { return [e.bear, e.base, e.bull].map(function (v) { return e.metal === 'ratio' ? UI.num(v, 2) : UI.rs(v, 0); }).join(' / '); } },
      { h: 'Status', f: function (e) { return e.status; } }, { h: 'Actual', n: 1, f: function (e) { return e.actual == null ? '' : UI.fmtP(e.actual, e.metal); } },
      { h: 'Error', n: 1, f: function (e) { return e.err == null ? '' : UI.pct(e.err, 2); } }, { h: 'Hit', f: function (e) { return e.hit == null ? '' : e.hit ? 'yes' : 'no'; } },
      { h: 'No-change hit', f: function (e) { return e.naive_hit == null ? '' : e.naive_hit ? 'yes' : 'no'; } }
    ], V.rows.slice().reverse());
  }
  function render() {
    UI.syncGlobal();
    if (document.activeElement !== $('aTol')) $('aTol').value = +(F.tol * 100).toFixed(4);
    if (document.activeElement !== $('aTgt')) $('aTgt').value = +(F.target * 100).toFixed(4);
    var B = bt(); UI.lastBacktest = B;
    meter(B); tables(B); naive(); chartHits(B); chartErr(B); scorecard();
  }
  function bind() {
    load();
    $('aTol').onchange = function () { var v = +$('aTol').value / 100; F.tol = E.clampTol(isFinite(v) && $('aTol').value !== '' ? v : 0.10); $('aTol').value = +(F.tol * 100).toFixed(4); UI.rerender(); };
    $('aTgt').onchange = function () { var v = +$('aTgt').value / 100; F.target = isFinite(v) && $('aTgt').value !== '' ? Math.min(1, Math.max(0.01, v)) : 0.90; $('aTgt').value = +(F.target * 100).toFixed(4); UI.rerender(); };
    $('scExpJ').onclick = function () { UI.download('scorecard_' + UI.stamp() + '.json', JSON.stringify({ schema: 'bullion-scorecard-1', exported_utc: new Date().toISOString(), mode: F.mode, entries: UI.visibleSC().rows }, null, 1)); };
    $('scExpC').onclick = function () { UI.download('scorecard_' + UI.stamp() + '.csv', UI.toCSV(UI.visibleSC().rows.map(function (e) { return UI.flat(e); })), 'text/csv'); };
    $('scImp').onchange = function (ev) {
      var f = ev.target.files[0]; if (!f) return; var rd = new FileReader();
      rd.onload = function () { try { var o = JSON.parse(rd.result), arr = Array.isArray(o) ? o : o.entries; if (!Array.isArray(arr)) throw new Error('no entries array'); var ids = {}; UI.SC.forEach(function (e) { ids[e.id] = 1; }); var n = 0; arr.forEach(function (e) { if (e && e.id && !ids[e.id] && e.anchor && e.base != null) { UI.SC.push(e); n++; } }); if (UI.hist()) UI.scoreAll(); save(); $('scMsg').textContent = 'Imported ' + n + ' entries.'; } catch (e) { $('scMsg').textContent = 'Import failed: ' + e.message; } UI.rerender(); };
      rd.readAsText(f);
    };
    $('scClear').onclick = function () { UI.SC = []; save(); $('scMsg').textContent = 'Scorecard cleared.'; UI.rerender(); };
  }
  window.UIPAGES.accuracy = [render];
  UI.bindAccuracy = bind;
})();
