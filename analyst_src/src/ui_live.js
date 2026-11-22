/* Live Monitor page: loaders, anchor gate, nowcast, P0, realised vol, signal feed, gap updates. */
(function () {
  'use strict';
  var UI = window.UI, E = UI.E, $ = UI.$, el = UI.el;

  function bind() {
    $('modeA').onclick = function () { UI.setMode('A'); };
    $('modeB').onclick = function () { UI.setMode('B'); };
    $('themeBtn').onclick = function () { UI.setTheme(UI.F.theme === 'dark' ? 'light' : 'dark'); };
    var msg = function (t) { $('loadMsg').textContent = t; };
    $('fSignals').onchange = function (e) { if (e.target.files[0]) UI.readFile(e.target.files[0], msg); };
    $('fHistory').onchange = function (e) { if (e.target.files[0]) UI.readFile(e.target.files[0], msg); };
    $('pasteLoad').onclick = function () { var t = $('pasteBox').value.trim(); if (!t) return msg('Nothing pasted.'); try { msg(UI.ingest(JSON.parse(t), 'pasted JSON')); } catch (e) { msg('Could not parse pasted JSON: ' + e.message); } };
    $('clearLive').onclick = function () { UI.LIVE.signals = null; UI.LIVE.history = null; UI.LIVE.files = {}; $('fSignals').value = ''; $('fHistory').value = ''; msg('Live data cleared.'); UI.rerender(); };
    var dz = $('dropZone');
    dz.ondragover = function (e) { e.preventDefault(); dz.classList.add('over'); };
    dz.ondragleave = function () { dz.classList.remove('over'); };
    dz.ondrop = function (e) { e.preventDefault(); dz.classList.remove('over'); Array.prototype.forEach.call(e.dataTransfer.files || [], function (f) { UI.readFile(f, msg); }); };
    UI.setMode('A');
  }

  function render() {
    UI.syncGlobal();
    var s = UI.sig(), h = UI.hist();
    // anchor gate status (1W / 1M)
    var ag = UI.liveAnchor('gold') || UI.userAnchor('gold'), as = UI.liveAnchor('silver') || UI.userAnchor('silver');
    if (!ag || !as) UI.banner('liveGate', 'block', E.BANNER_ANCHOR, (UI.liveOn() ? 'Mode B: load live_signals.json with Indian spot anchors' : 'Mode A: live values are blank') + ', or enter a spot price with date and basis on the Forecast page. Missing: ' + [!ag && 'gold', !as && 'silver'].filter(Boolean).join(', ') + '.');
    else UI.banner('liveGate', 'ok', 'Current spot anchors available for 1W / 1M', 'Gold: ' + ag.label + ' · Silver: ' + as.label);
    // nowcast table
    var rows = [], A = s && s.anchors || {};
    var spec = [['in_gold_rs_10g', 'India gold', 'Rs/10 g'], ['in_silver_rs_kg', 'India silver', 'Rs/kg'], ['world_gold_usd_oz', 'World gold', 'US$/oz'], ['world_silver_usd_oz', 'World silver', 'US$/oz'], ['inr_usd', 'INR per US$', 'Rs'], ['sgb_999_rs_g', 'SGB 999 redemption', 'Rs/g']];
    spec.forEach(function (k) { var a = A[k[0]] || {}; rows.push({ item: k[1], unit: k[2], a: a }); });
    UI.table('tb-live', [
      { h: 'Item', f: function (r) { return r.item; } }, { h: 'Value', n: 1, f: function (r) { return r.a.value == null ? '—' : (r.unit.indexOf('US$') === 0 ? 'US$ ' + UI.num(r.a.value, 2) : r.unit === 'Rs' ? UI.num(r.a.value, 4) : UI.rs(r.a.value, 0)); } },
      { h: 'Unit', f: function (r) { return r.unit; } }, { h: 'Purity', f: function (r) { return r.a.purity || ''; } }, { h: 'Market / basis', f: function (r) { return (r.a.market || '') + (r.a.note ? ' — ' + r.a.note : ''); } },
      { h: 'As of', f: function (r) { return r.a.as_of || ''; } }, { h: 'Tier', f: function (r) { return r.a.tier ? UI.tier(r.a.tier) : ''; } }, { h: 'Source', f: function (r) { return UI.link(r.a.url); } }
    ], rows);
    // P0
    var p = $('liveP0'); p.replaceChildren();
    if (!s) p.appendChild(el('p', { cls: 'd', text: UI.liveOn() ? 'No live_signals.json loaded: P0 must be entered by you on the Forecast page.' : 'Mode A: no live P0. Enter P0 on the Forecast page. The Apr 2026 RBI premium (gold 5.61%, silver 6.03%) is never used as a default for an anchor after 13 May 2026.' }));
    else {
      ['gold', 'silver'].forEach(function (m) {
        var v = UI.livePremium(m), inf = UI.liveP0Info(m), an = UI.liveAnchor(m);
        var sub = inf ? 'P0 as of ' + (inf.date || 'unknown') + (inf.dateIsRetrieval ? ' (retrieval date; load live_history.json for the quote date)' : '') + (an ? ' · anchor as of ' + an.date + (inf.date && an.date && inf.date !== an.date ? ' — DIFFERENT DATES' : '') : '') : '';
        p.appendChild(el('div', { cls: 'kpi' }, [el('div', { cls: 'l', text: 'P0 ' + m + ' (live) · indicative' }), el('div', { cls: 'v', text: v == null ? '—' : UI.pct(v, 3) }), el('div', { cls: 's', text: sub }),
          el('div', { cls: 's', text: 'Time basis: ' + (inf && inf.time_basis ? inf.time_basis : 'not stated in the loaded files') + (inf && inf.flagged ? ' — timing mismatch between world and Indian quotes (about 1.5–3.5 h), so this P0 is indicative only.' : '') })]));
      });
      var dp = h ? E.dailyPremiumRows(h.series, 'gold') : null;
      if (dp) p.appendChild(el('p', { cls: 'd', text: 'Daily premium rows in history: ' + dp.ok.length + ' time-aligned, ' + dp.flagged.length + ' flagged for a timing mismatch and left out of any premium estimate.' }));
      (s.notes || []).forEach(function (n) { p.appendChild(el('p', { cls: 'd', text: '• ' + n })); });
    }
    // vol
    var v = $('liveVol'); v.replaceChildren(); var lv = UI.liveVol();
    if (!s && !h) v.appendChild(el('p', { cls: 'd', text: 'No live data: volatility mode (c) unavailable; modes (a)/(b) use SSOT annual averages.' }));
    else {
      var rv = s && s.derived && s.derived.realized_vol_annual || {};
      [['World gold', lv.world_vol_gold], ['World silver', lv.world_vol_silver], ['INR/USD', lv.inr_vol], ['ρ(world, rupee)', lv.rho]].forEach(function (x, i) {
        v.appendChild(el('div', {}, [el('b', { text: x[0] + ': ' }), document.createTextNode(x[1] == null ? 'null (not measurable from the loaded files)' : (i === 3 ? UI.num(x[1], 3) : UI.pct(x[1], 2) + ' a year'))]));
      });
      v.appendChild(el('p', { cls: 'd', text: 'Window: ' + (rv.window_days || '—') + ' days. ' + (lv.world_vol_gold == null ? 'World volatility is null, so mode (c) cannot be computed; 1W/1M accuracy is NOT YET MEASURABLE.' : '') }));
    }
    // signals
    var sg = $('signals'); sg.replaceChildren();
    if (!s) sg.appendChild(el('div', { text: UI.liveOn() ? 'Load live_signals.json to see the signal feed.' : 'Mode A: signal feed blank.' }));
    else (s.signals || []).forEach(function (x) {
      var row = el('div', {}, [UI.tier(x.tier), el('b', { text: (x.category || '') + ' · ' + (x.scope || '') + ' · ' + (x.channel || '') + ' ' }), document.createTextNode(x.headline || ''),
        el('div', { cls: 'msg', text: (x.date || '') + (x.rationale ? ' — ' + x.rationale : '') }), UI.link(x.url)]);
      var ch = { WORLD_USD: 'world', INR_USD: 'fx', PREMIUM_PP: 'prem' }[x.channel];
      if (ch) row.appendChild(el('button', { text: 'Map to ' + ch + ' channel [USER-ASSUMPTION]', onclick: function () { UI.F.custom.push({ name: x.id + ': ' + (x.headline || '').slice(0, 60), channel: ch, value: x.shock_hint != null ? +x.shock_hint : 0, metal: x.scope === 'SILVER' ? 'silver' : x.scope === 'GOLD' ? 'gold' : 'both', src: 'LIVE signal ' + x.id }); $('loadMsg').textContent = 'Added ' + x.id + ' to custom factors (value ' + (x.shock_hint == null ? '0 — set it on the Scenario Matrix page' : x.shock_hint) + ').'; } }));
      sg.appendChild(row);
    });
    // gap updates + fetch log
    var g = $('gapUpd'); g.replaceChildren();
    if (!s && !h) g.appendChild(el('p', { cls: 'd', text: 'No live files. SSOT GAPs remain as listed on Caveats & Audit.' }));
    (s && s.ssot_gap_updates || []).forEach(function (u) { g.appendChild(el('div', {}, [el('b', { text: u.gap_id + ': ' }), document.createTextNode(u.status + (u.status === 'PUBLISHED' ? ' — shown in the live overlay only; SSOT_DB is unchanged' : '') + ' '), UI.link(u.url)])); });
    if (h && h.fetch_log) {
      var c = {}; h.fetch_log.forEach(function (f) { c[f.status] = (c[f.status] || 0) + 1; });
      g.appendChild(el('p', { cls: 'd', text: 'Fetch log: ' + Object.keys(c).map(function (k) { return k + ' ' + c[k]; }).join(' · ') + ' (' + h.fetch_log.length + ' sources).' }));
    }
  }
  window.UIPAGES.live = [render];
  UI.bindLive = bind;
})();
