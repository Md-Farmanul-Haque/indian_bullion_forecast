/* Caveats & Audit page (G7 caveats, integrity checksums, open GAPs, embedded audit_log.json) and app init. */
(function () {
  'use strict';
  var UI = window.UI, E = UI.E, DB = UI.DB, $ = UI.$, el = UI.el;
  var CAVEATS = [
    ['Series break (RBI, 2000-01)', 'RBI flags a source and comparability break between 1999-2000 and 2000-01. Before the break the source is the Bombay Bullion Association and the Press Trust of India (BBA/PTI); after it, the financial press, IBJA, LBMA and Thomson Reuters/IMF-IFS. RBI: "Data provided in this Table for the period 1983-84 to 1999-2000 and 2000-01 to 2025-26 may not be strictly comparable".'],
    ['† Non-government mirror (RCF 1958-59)', 'The only readable copy of RBI\'s 1958-59 Report on Currency and Finance sits on a non-government mirror of RBI\'s site. It is an RBI document but not a government host, so every 1950s figure taken from it (dated points, pre-1970 silver FY averages, 1950s duty rows) carries †.'],
    ['Purity of RBI Standard Gold is not stated', 'No RBI table states purity; the Bulletin labels the series "Standard Gold". SGB prices are 999 and Income Tax rates are 995. RBI Standard Gold, Income Tax 995 and SGB 999 are separate, non-interchangeable benchmarks; Standard Gold is never converted to 995 or 999. Only known-purity scaling (999 ↔ 995 by 995/999) is offered.'],
    ['[NG] Q3 2026 domestic discount and unofficial inflows', 'WGC [NG] reports a record domestic discount (about US$43/oz average in Q3 2026) and about 50 t of unofficial inflows after the May 2026 hike. RBI\'s international columns end in April 2026, so this cannot be checked against RBI data.'],
    ['[L] Duty split 10% BCD + 5% AIDC', 'The 6% → 15% rise from 13 May 2026 is confirmed on a government page (C); the split into 10% BCD + 5% AIDC is known only from press reports of the notifications (L).'],
    ['DERIVED values', 'INR/USD 94.71 for 2026-27 is a DERIVED mean of RBI monthly averages Apr–Jun 2026, not an official figure. The 2026-27 row (gold Rs 149,723.66, silver Rs 239,733.63) is a YEAR-TO-DATE DERIVED mean (Apr–Aug 2026) and is never treated as an annual average.'],
    ['Pre-1970 points', 'The 1950-51 (Rs 97.70) and 1962-63 (Rs 119.59) gold cells are ministerial year figures: shown only as dated points, never as annual averages. Annual gold averages 1946-47 to 1969-70 stay GAP. Pre-1970 silver FY averages carry †.'],
    ['Identity residual', 'The decomposition identity Δln(INR price) = Δln(world US$) + Δln(INR/USD) + Δln((1+P_h)/(1+P0)) holds by construction; its residual is a code-sanity check only and proves nothing about accuracy.'],
    ['No spurious drivers (G6)', 'After 1990 no WPI/CPI inflation, monsoon or festival multiplier is used: post-1990 WPI correlations are −0.05 (gold) and −0.04 (silver), correlation is not causation, and yearly averages hide seasonality.'],
    ['Honest accuracy (G8)', 'Every accuracy figure is shown beside the no-change benchmark for the same metal, horizon and window, with its n. Hitting ±10% at 1W is not evidence of skill if no-change also hits it. Live 1W/1M accuracy needs ≥ 52 weekly / ≥ 24 monthly test points; below that it is NOT YET MEASURABLE.'],
    ['Not advice (G9)', 'Outputs are scenario-conditioned projections and measured accuracy. Nothing here recommends a transaction.'],
    ['Offline (G10)', 'This file makes no network request; d3 is inlined. Source links open only when you click them. Live data arrives only as JSON files you load.']
  ];
  var GAPS = ['Annual gold averages, FY 1946-47 to 1969-70 (dated points only)', 'RBI monthly averages, Sep–Nov 2026', 'RBI international columns and domestic premium after Apr 2026',
    'Official INR/USD for FY 1964-65 and 1971-72 to 1973-74, plus the 1966-67 devaluation-split year'];
  function render() {
    UI.syncGlobal();
    var l = $('cvList'); l.replaceChildren();
    CAVEATS.forEach(function (c) { l.appendChild(el('li', {}, [el('b', { text: c[0] + ': ' }), document.createTextNode(c[1])])); });
    var M = window.SSOT_META || {}, ig = $('cvIntegrity'); ig.replaceChildren();
    ig.appendChild(el('li', {}, [el('b', { text: 'F1 SHA-256: ' }), el('code', { text: M.f1_sha256 || '?' })]));
    ig.appendChild(el('li', { text: 'Row counts: ' + Object.keys(M.row_counts || {}).map(function (k) { return k + ' ' + M.row_counts[k]; }).join(' · ') }));
    ig.appendChild(el('li', { text: 'SSOT_DB deep-frozen: ' + (Object.isFrozen(DB) && Object.isFrozen(DB.master_yearly) && Object.isFrozen(DB.master_yearly[0]) ? 'yes' : 'NO') + ' · built ' + (M.built_utc || '?') + ' · engine ' + E.version }));
    ig.appendChild(el('li', { text: 'Fixture D (σ = √(1ᵀΣ1), 36 rows): gold ' + (100 * E.sigmaAnnualSSOT(DB, 'gold')).toFixed(2) + ', silver ' + (100 * E.sigmaAnnualSSOT(DB, 'silver')).toFixed(2) + ' log-points' }));
    (M.mismatches || []).forEach(function (x) { ig.appendChild(el('li', { text: 'Constant check: ' + x })); });
    var g = $('cvGaps'); g.replaceChildren(); GAPS.forEach(function (x) { g.appendChild(el('li', { text: x })); });
    var lv = UI.sig(); if (lv) (lv.ssot_gap_updates || []).forEach(function (u) { g.appendChild(el('li', { text: '[LIVE overlay] ' + u.gap_id + ': ' + u.status })); });
    audit();
  }
  function audit() {
    var b = $('auditBox'); b.replaceChildren(); var A = window.AUDIT_LOG;
    if (!A) { b.appendChild(el('p', {}, [el('b', { text: 'Audit pending. ' }), document.createTextNode('The audit writes audit/audit_log.json; embed it with '), el('code', { text: 'python3 src/build.py --audit out/audit_log.json' }), document.createTextNode('.')])); return; }
    var st = String(A.status || '').toUpperCase();
    b.appendChild(el('p', {}, [document.createTextNode('Status: '), el('span', { cls: st === 'PASS' ? 'audit-pass' : 'audit-fail', text: st || '?' }), document.createTextNode((A.generated_utc || A.at_utc ? ' · ' + (A.generated_utc || A.at_utc) : '') + (A.loop != null ? ' · loop ' + A.loop : ''))]));
    var checks = A.checks || A.per_check || {};
    var rows = Array.isArray(checks) ? checks : Object.keys(checks).map(function (k) { var v = checks[k]; return typeof v === 'object' && v ? Object.assign({ id: k }, v) : { id: k, status: v }; });
    var t = el('table'); t.id = 'tb-audit'; b.appendChild(el('div', { cls: 'tw' }, [t]));
    UI.table('tb-audit', [{ h: 'Check', f: function (r) { return r.id || r.name || r.check || ''; } }, { h: 'Status', f: function (r) { var s = String(r.status || r.flag || r.pass || ''); return el('span', { cls: /pass|true|ok/i.test(s) ? 'audit-pass' : 'audit-fail', text: s }); } },
      { h: 'Details', f: function (r) { var o = {}; Object.keys(r).forEach(function (k) { if (['id', 'name', 'check', 'status', 'flag', 'pass'].indexOf(k) < 0) o[k] = r[k]; }); var s = JSON.stringify(o); return s.length > 400 ? s.slice(0, 400) + '…' : s; } }], rows);
  }
  window.UIPAGES.caveats = [render];
  UI.init = function () {
    var th = 'light'; try { th = localStorage.getItem('bullion_theme') || 'light'; } catch (e) { /* storage unavailable */ }
    document.documentElement.setAttribute('data-theme', th); UI.F.theme = th; $('themeBtn').textContent = th === 'dark' ? 'Light' : 'Dark';
    UI.bindForecast(); UI.bindMatrix(); UI.bindAccuracy(); UI.bindLive(); // bindLive sets Mode A and renders
  };
})();
