/* Scenario Matrix: illustrative presets and a custom-factor table mapped only to the three channels. */
(function () {
  'use strict';
  var UI = window.UI, E = UI.E, $ = UI.$, el = UI.el, F = UI.F;
  var PRESETS = [
    { id: 'neutral', name: 'Neutral', desc: 'no change to any channel', over: {} },
    { id: 'duty6', name: 'Duty 15→6', desc: 'new duty 6% (both metals), pass-through × λ', over: { gold: { dutyNew: 0.06 }, silver: { dutyNew: 0.06 } } },
    { id: 'rupee8', name: 'Rupee stress +8%', desc: 'INR/USD +8%', over: { fx: 0.08 } },
    { id: 'haven15', name: 'Safe-haven +15% USD', desc: 'world US$ price +15% (both metals)', over: { gold: { world: 0.15 }, silver: { world: 0.15 } } },
    { id: 'squeeze10', name: 'Silver squeeze +10 pp', desc: 'silver premium +10 pp (gold unaffected)', over: { silver: { prem: 0.10 } } }
  ];
  var CH = { world: 'World USD %', fx: 'INR/USD %', prem: 'Premium pp' };
  function overFor(rows) {
    var o = { fx: 0, gold: { world: 0, prem: 0 }, silver: { world: 0, prem: 0 } };
    rows.forEach(function (c) {
      var v = +c.value || 0;
      if (c.channel === 'fx') o.fx += v;
      else ['gold', 'silver'].forEach(function (m) { if (c.metal === 'both' || c.metal === m) o[m][c.channel === 'world' ? 'world' : 'prem'] += v; });
    });
    return o;
  }
  function res(over) { return UI.run(F.metal, F.horizon, Object.assign({ neutral: true }, over)); }
  var unitV = function (r, v) { var m = F.metal; return UI.disp(v, m, m === 'ratio' ? '' : r.legs[m].anchor.basis); };
  function fmtImpact(r, base) { if (r.blocked) return '—'; var d = unitV(r, r.base) - unitV(r, base); return F.metal === 'ratio' ? (d >= 0 ? '+' : '−') + UI.num(Math.abs(d), 2) : (d >= 0 ? '+' : '−') + UI.rs(Math.abs(d)); }
  UI.matrixData = function () {
    var neutral = res({});
    var pres = PRESETS.map(function (p) {
      var r = res(p.over); return { preset: p.name, channels: p.desc, metal: F.metal, horizon: F.horizon, blocked: !!r.blocked, dln_lp: r.blocked ? null : r.dln * 100, base: r.blocked ? null : r.base, bear: r.blocked ? null : r.bear, bull: r.blocked ? null : r.bull, vs_neutral_lp: r.blocked || neutral.blocked ? null : (r.dln - neutral.dln) * 100, _r: r, _p: p };
    });
    var cust = F.custom.map(function (c) { var r = res(overFor([c])); return { factor: c.name, channel: CH[c.channel], applies_to: c.metal, value: c.value, tag: '[USER-ASSUMPTION]', source: c.src || 'user', dln_lp: r.blocked || neutral.blocked ? null : (r.dln - neutral.dln) * 100, _r: r, _c: c }; });
    var tot = res(overFor(F.custom));
    return { neutral: neutral, presets: pres, custom: cust, total: tot };
  };
  function render() {
    UI.syncGlobal();
    var M = UI.matrixData(), n = M.neutral;
    if (n.blocked) UI.banner('mxBanner', 'block', n.banner, n.reason + ' Set the anchor and P0 on the Forecast page first.'); else UI.banner('mxBanner', '', '');
    UI.table('tb-presets', [
      { h: 'Preset', f: function (r) { return r.preset; } }, { h: 'Channels changed', f: function (r) { return r.channels; } },
      { h: 'Δln vs anchor (log-pts)', n: 1, f: function (r) { return r.blocked ? '—' : UI.lp(r._r.dln); } },
      { h: 'vs Neutral (log-pts)', n: 1, f: function (r) { return r.vs_neutral_lp == null ? '—' : UI.lp(r.vs_neutral_lp / 100); } },
      { h: 'Base', n: 1, f: function (r) { return r.blocked ? '—' : UI.fmtP(unitV(r._r, r._r.base), F.metal); } },
      { h: 'Rupee impact vs Neutral', n: 1, f: function (r) { return n.blocked ? '—' : fmtImpact(r._r, n.base); } },
      { h: 'Bear–Bull', n: 1, f: function (r) { return r.blocked || r._r.bear == null ? '—' : UI.fmtP(unitV(r._r, r._r.bear), F.metal) + ' – ' + UI.fmtP(unitV(r._r, r._r.bull), F.metal); } },
      { h: '', f: function (r) { return el('button', { text: 'Apply', title: 'Replace the Forecast shocks with this preset', onclick: function () { apply(r._p.over); } }); } }
    ], M.presets);
    var cols = [
      { h: 'Factor', f: function (r, i) { return inp(r._c, 'name', 'text'); } },
      { h: 'Channel', f: function (r) { var s = el('select'); Object.keys(CH).forEach(function (k) { s.add(new Option(CH[k], k)); }); s.value = r._c.channel; s.onchange = function () { r._c.channel = s.value; UI.rerender(); }; return s; } },
      { h: 'Applies to', f: function (r) { var s = el('select'); ['both', 'gold', 'silver'].forEach(function (k) { s.add(new Option(k, k)); }); s.value = r._c.metal; s.onchange = function () { r._c.metal = s.value; UI.rerender(); }; return s; } },
      { h: 'Value (% or pp)', f: function (r) { return inp(r._c, 'value', 'number'); } },
      { h: 'Tag', f: function () { return UI.tag('[USER-ASSUMPTION]', 'ua'); } },
      { h: 'Log-points', n: 1, f: function (r) { return r.dln_lp == null ? '—' : UI.lp(r.dln_lp / 100); } },
      { h: 'Rupee impact', n: 1, f: function (r) { return n.blocked ? '—' : fmtImpact(r._r, n.base); } },
      { h: '', f: function (r) { return el('button', { text: 'Remove', onclick: function () { F.custom.splice(F.custom.indexOf(r._c), 1); UI.rerender(); } }); } }
    ];
    var rows = M.custom.slice();
    if (rows.length) rows.push({ _total: true, _r: M.total, _cls: 'sel' });
    var t = $('tb-custom'); t.replaceChildren(); var h = t.createTHead().insertRow(); cols.forEach(function (c) { var th = document.createElement('th'); th.textContent = c.h; if (c.n) th.className = 'n'; h.appendChild(th); });
    var tb = t.createTBody();
    if (!rows.length) { var tr0 = tb.insertRow(), td0 = tr0.insertCell(); td0.colSpan = cols.length; td0.textContent = 'No custom factors. Add one, or map a live signal from the Live Monitor page.'; }
    rows.forEach(function (r) {
      var tr = tb.insertRow(); if (r._cls) tr.className = r._cls;
      if (r._total) { var a = tr.insertCell(); a.colSpan = 5; a.textContent = 'Total of all factors'; var b = tr.insertCell(); b.className = 'n'; b.textContent = M.total.blocked || n.blocked ? '—' : UI.lp(M.total.dln - n.dln); var c = tr.insertCell(); c.className = 'n'; c.textContent = n.blocked ? '—' : fmtImpact(M.total, n.base); tr.insertCell(); return; }
      cols.forEach(function (c) { var td = tr.insertCell(); if (c.n) td.className = 'n'; var v = c.f(r); if (v instanceof Node) td.appendChild(v); else td.textContent = v; });
    });
  }
  function inp(obj, k, type) {
    var i = el('input', { type: type }); i.value = k === 'value' ? +(obj[k] * 100).toFixed(6) : obj[k];
    if (type === 'number') i.step = '0.5';
    i.onchange = function () { obj[k] = type === 'number' ? (isFinite(+i.value) ? +i.value / 100 : 0) : i.value; UI.rerender(); };
    return i;
  }
  function apply(over) {
    ['gold', 'silver'].forEach(function (m) { var L = F.leg[m]; L.world = 0; L.disc = 0; L.lic = 0; L.dnew = null; }); F.fx = 0;
    ['gold', 'silver'].forEach(function (m) { var o = over[m] || {}; var L = F.leg[m]; if (o.dutyNew != null) L.dnew = o.dutyNew; if (o.world) L.world = (L.world || 0) + o.world; if (o.prem) { if (m === 'silver') L.lic = (L.lic || 0) + o.prem; else L.disc = (L.disc || 0) + o.prem; } });
    if (over.fx) F.fx = over.fx;
    window.LEGACY.go('forecast');
  }
  function bind() {
    $('mxAdd').onclick = function () { F.custom.push({ name: 'Custom factor ' + (F.custom.length + 1), channel: 'world', value: 0, metal: 'both', src: 'user' }); UI.rerender(); };
    $('mxApply').onclick = function () {
      var o = overFor(F.custom); if (!F.custom.length) { $('mxMsg').textContent = 'No custom factors to add.'; return; }
      ['gold', 'silver'].forEach(function (m) { F.leg[m].world = (F.leg[m].world || 0) + o[m].world; F.leg[m].disc = (F.leg[m].disc || 0) + o[m].prem; });
      F.fx += o.fx; F.custom = []; $('mxMsg').textContent = 'Totals added to the Forecast inputs (and the factor list cleared to avoid double counting).'; UI.rerender();
    };
    var strip = function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (k[0] !== '_') o[k] = r[k]; }); return o; };
    var data = function () { var M = UI.matrixData(); return { generated_utc: new Date().toISOString(), mode: F.mode, metal: F.metal, horizon: F.horizon, note: 'Illustrative scenarios; [USER-ASSUMPTION] inputs; not advice.', presets: M.presets.map(strip), custom: M.custom.map(strip), total_dln_lp: M.total.blocked || M.neutral.blocked ? null : (M.total.dln - M.neutral.dln) * 100 }; };
    $('mxExpJ').onclick = function () { UI.download('scenario_matrix_' + UI.stamp() + '.json', JSON.stringify(data(), null, 1)); };
    $('mxExpC').onclick = function () { var d = data(); UI.download('scenario_matrix_' + UI.stamp() + '.csv', UI.toCSV(d.presets.map(function (r) { r.kind = 'preset'; return r; }).concat(d.custom.map(function (r) { r.kind = 'custom'; return r; }))), 'text/csv'); };
  }
  window.UIPAGES.matrix = [render];
  UI.bindMatrix = bind;
})();
