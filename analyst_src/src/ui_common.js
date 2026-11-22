/* Shared UI state, quarantined LIVE store, mode/theme, formatting and forecast-input assembly. */
(function () {
  'use strict';
  var E = window.BullionEngine, DB = window.SSOT_DB;
  var UI = window.UI = {};
  window.UIPAGES = window.UIPAGES || {};
  UI.E = E; UI.DB = DB;
  var $ = UI.$ = function (id) { return document.getElementById(id); };
  UI.el = function (tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'text') e.textContent = attrs[k]; else if (k === 'cls') e.className = attrs[k];
      else if (k.slice(0, 2) === 'on') e[k] = attrs[k]; else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  };
  var nf2 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }), nf0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
  UI.rs = function (v, d) { if (v == null || !isFinite(v)) return '—'; return 'Rs ' + (d === 0 ? nf0.format(v) : nf2.format(v)); };
  UI.num = function (v, d) { if (v == null || !isFinite(v)) return '—'; return (+v).toFixed(d == null ? 2 : d); };
  UI.pct = function (v, d) { if (v == null || !isFinite(v)) return '—'; d = d == null ? 1 : d; var x = v * 100; return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%'; };
  UI.pp = function (v, d) { if (v == null || !isFinite(v)) return '—'; d = d == null ? 2 : d; var x = v * 100; return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + ' pp'; };
  UI.lp = function (v, d) { if (v == null || !isFinite(v)) return '—'; var x = v * 100; return (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d == null ? 2 : d); };
  UI.tag = function (t, cls) { return UI.el('span', { cls: 'tag ' + (cls || ''), text: t }); };
  UI.tier = function (t) { return UI.el('span', { cls: 'tier ' + (t || ''), text: t || 'UNTAGGED' }); };
  UI.link = function (u, t) {
    if (!u || !/^https?:\/\//.test(u)) return document.createTextNode(t || u || '');
    var a = UI.el('a', { href: u, target: '_blank', rel: 'noopener noreferrer' }); try { a.textContent = t || new URL(u).hostname.replace(/^www\./, ''); } catch (e) { a.textContent = t || u; } return a;
  };
  UI.banner = function (id, kind, title, small) {
    var b = $(id); if (!b) return; b.replaceChildren();
    if (!title) { b.className = 'banner'; return; }
    b.className = 'banner on ' + kind; b.appendChild(document.createTextNode(title));
    if (small) b.appendChild(UI.el('small', { text: small }));
  };
  UI.table = function (id, cols, rows) {
    var t = $(id); t.replaceChildren(); var h = t.createTHead().insertRow();
    cols.forEach(function (c) { var th = document.createElement('th'); th.textContent = c.h; if (c.n) th.className = 'n'; h.appendChild(th); });
    var tb = t.createTBody();
    rows.forEach(function (r) {
      var tr = tb.insertRow(); if (r._cls) tr.className = r._cls;
      cols.forEach(function (c) { var td = tr.insertCell(); if (c.n) td.className = 'n'; var v = c.f(r); if (v instanceof Node) td.appendChild(v); else td.textContent = v == null ? '' : v; });
    });
  };
  UI.download = function (name, text, type) {
    var b = new Blob([text], { type: type || 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  UI.toCSV = function (rows) {
    if (!rows.length) return '';
    var keys = []; rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
    var q = function (v) { if (v == null) return ''; if (typeof v === 'number') return isFinite(v) ? String(+v.toFixed(8)) : ''; if (typeof v === 'object') v = JSON.stringify(v); return '"' + String(v).replace(/"/g, '""') + '"'; };
    return [keys.join(',')].concat(rows.map(function (r) { return keys.map(function (k) { return q(r[k]); }).join(','); })).join('\n');
  };
  UI.flat = function (o, pre, out) {
    out = out || {}; pre = pre || '';
    Object.keys(o || {}).forEach(function (k) { var v = o[k], key = pre ? pre + '.' + k : k; if (v && typeof v === 'object' && !Array.isArray(v)) UI.flat(v, key, out); else out[key] = Array.isArray(v) ? JSON.stringify(v) : v; });
    return out;
  };
  UI.stamp = function () { return new Date().toISOString().replace(/[:]/g, '').slice(0, 15); };
  UI.colorVar = function (n) { return getComputedStyle(document.documentElement).getPropertyValue('--' + n).trim(); };

  // ---------------------------------------------------------------- state
  var leg = function () { return { src: 'auto', uv: null, ud: '', ub: '999', bench: 'aug2026', p0src: 'auto', p0u: null, p0meta: null, p0note: '', dcur: null, dnew: null, world: 0, disc: 0, lic: 0 }; };
  UI.F = {
    mode: 'A', theme: 'light', metal: 'gold', horizon: '1Y', unit: { gold: 'rs_10g', silver: 'rs_kg', ratio: 'ratio' }, purity: 'asis',
    volMode: 'a', premVar: true, trend: 'zero', dist: 'lognormal', lambda: { '1W': E.LAMBDA_DEFAULT['1W'], '1M': E.LAMBDA_DEFAULT['1M'], '1Y': E.LAMBDA_DEFAULT['1Y'] },
    span: 'auto', fscale: 'log', fx: 0, leg: { gold: leg(), silver: leg() }, tol: 0.10, target: 0.90, custom: []
  };
  // Quarantined live overlay (never merged into SSOT_DB)
  UI.LIVE = { signals: null, history: null, files: {} };
  UI.liveOn = function () { return UI.F.mode === 'B'; };
  UI.sig = function () { return UI.liveOn() ? UI.LIVE.signals : null; };
  UI.hist = function () { return UI.liveOn() ? UI.LIVE.history : null; };

  UI.rerender = function () { if (window.LEGACY) window.LEGACY.render(); };
  /** Re-render every UI page (visible or hidden) so no page keeps stale live values after a mode/data change. */
  UI.renderAll = function () {
    var cur = window.LEGACY && window.LEGACY.S.page;
    Object.keys(window.UIPAGES).forEach(function (p) { if (p !== cur) (window.UIPAGES[p] || []).forEach(function (f) { try { f(); } catch (e) { console.error(p, e); } }); });
    UI.rerender();
  };
  UI.setMode = function (m) {
    UI.F.mode = m;
    if (m === 'A') { // G2: Mode A clears every live value
      UI.LIVE.signals = null; UI.LIVE.history = null; UI.LIVE.files = {};
      ['fSignals', 'fHistory'].forEach(function (id) { var e = $(id); if (e) { e.value = ''; e.disabled = true; } });
      var pb = $('pasteBox'); if (pb) { pb.value = ''; pb.disabled = true; }
      var pl = $('pasteLoad'); if (pl) pl.disabled = true;
    } else {
      ['fSignals', 'fHistory', 'pasteBox', 'pasteLoad'].forEach(function (id) { var e = $(id); if (e) e.disabled = false; });
    }
    UI.renderAll();
  };
  UI.setTheme = function (t) {
    UI.F.theme = t; document.documentElement.setAttribute('data-theme', t);
    var b = $('themeBtn'); if (b) b.textContent = t === 'dark' ? 'Light' : 'Dark';
    try { localStorage.setItem('bullion_theme', t); } catch (e) { /* storage unavailable */ }
    UI.rerender();
  };
  UI.syncGlobal = function () {
    ['modeA', 'modeB'].forEach(function (id) { var b = $(id); if (b) b.classList.toggle('on', b.dataset.mode === UI.F.mode); });
    var s = $('liveStatus'); if (!s) return;
    if (!UI.liveOn()) s.textContent = 'Mode A · Pure SSOT: live values blank. SSOT history to 20 Nov 2026 from F1 only.';
    else {
      var a = UI.LIVE.signals ? 'signals ✓ (' + (UI.LIVE.signals.retrieved_at_utc || '?') + ', ' + (UI.LIVE.signals.mode || '') + ')' : 'signals not loaded';
      var h = UI.LIVE.history ? 'history ✓ (' + UI.LIVE.history.series.length + ' rows)' : 'history not loaded';
      s.textContent = 'Mode B · SSOT + Live: ' + a + ' · ' + h + '.';
    }
  };

  // ---------------------------------------------------------------- live loaders (Mode B only)
  UI.ingest = function (obj, name) {
    if (!UI.liveOn()) return 'Switch to Mode B to load live files.';
    if (!obj || typeof obj !== 'object') return 'Not a JSON object.';
    if (obj.anchors && obj.derived) { UI.LIVE.signals = obj; UI.LIVE.files.signals = name || 'pasted'; }
    else if (Array.isArray(obj.series)) { UI.LIVE.history = obj; UI.LIVE.files.history = name || 'pasted'; }
    else return 'Unrecognised file: expected live_signals.json (anchors, derived) or live_history.json (series).';
    if (UI.LIVE.history) UI.scoreAll && UI.scoreAll();
    UI.renderAll();
    return 'Loaded ' + (name || 'pasted JSON') + '.';
  };
  UI.readFile = function (file, cb) {
    var r = new FileReader();
    r.onload = function () { var msg; try { msg = UI.ingest(JSON.parse(r.result), file.name); } catch (e) { msg = 'Could not parse ' + file.name + ': ' + e.message; } cb && cb(msg); };
    r.readAsText(file);
  };

  // ---------------------------------------------------------------- anchors, P0, duty
  var MON = DB.monthly_2025_2026, MY = DB.master_yearly;
  var aug = MON.filter(function (r) { return r.month === '2026-08'; })[0], fy26 = MY.filter(function (r) { return r.fiscal_year === '2025-26'; })[0];
  UI.BENCH = {
    aug2026: { label: 'from Aug 2026 RBI avg (Bulletin T21)', date: '2026-08-31', gold: aug.gold_rs_10g, silver: aug.silver_rs_kg, p0: null },
    fy2526: { label: 'from FY 2025-26 RBI avg (HSIE T35)', date: '2026-03-31', gold: fy26.gold_rs_per_10g, silver: fy26.silver_rs_per_kg, p0: { gold: fy26.gold_premium_pct_DERIVED / 100, silver: fy26.silver_premium_pct_DERIVED / 100 } }
  };
  UI.liveAnchor = function (m) {
    var s = UI.sig(); if (!s) return null;
    var a = s.anchors && s.anchors[m === 'gold' ? 'in_gold_rs_10g' : 'in_silver_rs_kg'];
    if (!a || a.value == null || !isFinite(a.value)) return null;
    return { value: +a.value, date: String(a.as_of || '').slice(0, 10), basis: a.purity || 'stated in file', kind: 'LIVE', label: 'LIVE · ' + (a.market || '') + ' · ' + (a.as_of || ''), tier: a.tier, url: a.url };
  };
  UI.livePremium = function (m) {
    var s = UI.sig(); if (!s || !s.derived) return null;
    var v = s.derived[m === 'gold' ? 'p0_gold_pct' : 'p0_silver_pct']; return v == null || !isFinite(v) ? null : v / 100;
  };
  UI.userAnchor = function (m) {
    var L = UI.F.leg[m];
    if (L.uv == null || !(L.uv > 0) || !L.ud || !L.ub) return null;
    return { value: +L.uv, date: L.ud, basis: L.ub, kind: 'USER', label: 'USER · ' + L.ub + ' · ' + L.ud };
  };
  UI.benchAnchor = function (m) {
    var B = UI.BENCH[UI.F.leg[m].bench]; if (!B) return null;
    return { value: B[m], date: B.date, basis: m === 'gold' ? 'RBI Standard Gold (purity not stated)' : 'RBI silver (purity not stated)', kind: 'SSOT-BENCHMARK', label: 'SSOT BENCHMARK · ' + B.label };
  };
  UI.resolveAnchor = function (m, horizon) {
    var L = UI.F.leg[m], src = L.src;
    if (src === 'live') return UI.liveAnchor(m);
    if (src === 'user') return UI.userAnchor(m);
    if (src === 'ssot') return horizon === '1Y' ? UI.benchAnchor(m) : null;
    return UI.liveAnchor(m) || UI.userAnchor(m) || (horizon === '1Y' ? UI.benchAnchor(m) : null);
  };
  /** Live P0 provenance: the history row whose computed premium reproduces derived.p0_<m>_pct (date + time basis). */
  UI.liveP0Info = function (m) {
    var v = UI.livePremium(m); if (v == null) return null;
    var s = UI.sig(), d = s && s.derived || {}, info = { value: v, date: d['p0_' + m + '_date'] || null, time_basis: d['p0_' + m + '_time_basis'] || '', flagged: false };
    var h = UI.hist();
    if (h) {
      var ik = m === 'gold' ? 'in_gold_rs_10g' : 'in_silver_rs_kg', wk = m === 'gold' ? 'world_gold_usd' : 'world_silver_usd', f = m === 'gold' ? 10 / 31.1034768 : 1000 / 31.1034768;
      h.series.forEach(function (r) {
        if (r[ik] == null || r[wk] == null || r.inr_usd == null) return;
        var p = r[ik] / (r[wk] * r.inr_usd * f) - 1;
        if (Math.abs(p - v) < 2e-5) { info.date = info.date || r.date; info.time_basis = info.time_basis || r.time_basis || ''; info.flagged = /gap|mismatch/i.test(r.time_basis || ''); }
      });
    }
    if (!info.date && s && s.retrieved_at_utc) { info.date = String(s.retrieved_at_utc).slice(0, 10); info.dateIsRetrieval = true; }
    return info;
  };
  /** G4 resolution with provenance. SSOT-sourced P0 is tagged with its source date and is cleared whenever the anchor
   *  is dated on/after 13 May 2026 (or is no longer the matching FY 2025-26 benchmark). Typed entries stay, tagged [USER]. */
  UI.resolveP0 = function (m, anchor) {
    var L = UI.F.leg[m], post = anchor && anchor.date >= E.DUTY_HIKE_DATE;
    if (L.p0meta && L.p0meta.kind === 'SSOT') {
      var okSsot = anchor && !post && anchor.kind === 'SSOT-BENCHMARK' && L.bench === L.p0meta.bench && L.p0meta.date < E.DUTY_HIKE_DATE;
      if (!okSsot) { L.p0u = null; L.p0meta = null; L.p0note = 'SSOT ' + 'FY 2025-26 premium cleared: it is dated before 13 May 2026 and the anchor is ' + (anchor ? anchor.label + ' (' + anchor.date + ')' : 'not set') + '.'; }
    }
    var live = L.p0src === 'user' ? null : UI.livePremium(m), li = live == null ? null : UI.liveP0Info(m);
    var user = L.p0src === 'live' ? null : L.p0u;
    var r = E.resolveP0({ metal: m, anchorDate: anchor && anchor.date, live: live, user: user, prefer: L.p0src === 'user' ? 'user' : 'live' });
    if (r.ok && r.source === 'user' && L.p0meta && L.p0meta.kind === 'SSOT') { r.source = 'ssot-matched'; r.date = L.p0meta.date; r.tag = '[SSOT FY 2025-26, dated ' + L.p0meta.date + ']'; }
    else if (r.ok && r.source === 'user') { r.tag = '[USER]'; }
    else if (r.ok && r.source === 'live') { r.date = li && li.date; r.tag = '[LIVE, as of ' + (r.date || '?') + (li && li.flagged ? ', indicative: timing gap' : '') + ']'; }
    if (!r.ok && L.p0note) r.reason = L.p0note + ' ' + r.reason;
    return r;
  };
  UI.dutyCur = function (m, anchor) { var L = UI.F.leg[m]; if (L.dcur != null) return { v: L.dcur, src: 'user' }; var d = anchor ? E.dutyInForce(m, anchor.date) : null; return { v: d, src: d == null ? 'unknown' : 'SSOT duty history on anchor date' }; };
  UI.liveVol = function () {
    var s = UI.sig(), h = UI.hist(), out = { world_vol_gold: null, world_vol_silver: null, inr_vol: null, rho: null, notes: [] };
    if (!s && !h) return out;
    var rv = s && s.derived && s.derived.realized_vol_annual || {};
    out.world_vol_gold = rv.world_gold != null ? rv.world_gold : null; out.world_vol_silver = rv.world_silver != null ? rv.world_silver : null;
    out.inr_vol = rv.inr_usd != null ? rv.inr_usd : null; out.rho = rv.rho_world_fx != null ? rv.rho_world_fx : null;
    if (h) {
      var g = E.realizedVol(h.series, 'world_gold_usd'), sv = E.realizedVol(h.series, 'world_silver_usd'), fx = E.realizedVol(h.series, 'inr_usd');
      if (out.world_vol_gold == null && g.vol != null) out.world_vol_gold = g.vol;
      if (out.world_vol_silver == null && sv.vol != null) out.world_vol_silver = sv.vol;
      if (out.inr_vol == null && fx.vol != null) out.inr_vol = fx.vol;
      out.n = { world_gold: g.n, world_silver: sv.n, inr_usd: fx.n };
    }
    return out;
  };

  /** Assemble engine inputs for metal/horizon from UI state; returns {inp, legs:{m:{anchor,p0,duty}}, blocked?} */
  UI.buildInputs = function (metal, horizon, over) {
    var F = UI.F, legsM = metal === 'ratio' ? ['gold', 'silver'] : [metal], info = {}, inp = { metal: metal, horizon: horizon, trend: F.trend, volMode: F.volMode, premVar: F.premVar, dist: F.dist, lambda: F.lambda[horizon], fxPct: F.fx, live: UI.liveVol() };
    over = over || {};
    legsM.forEach(function (m) {
      var L = F.leg[m], a = UI.resolveAnchor(m, horizon), p0 = UI.resolveP0(m, a), dc = UI.dutyCur(m, a);
      var o = over[m] || {}, z = over.neutral ? { world: 0, disc: 0, lic: 0, dnew: null } : L, fx0 = over.neutral ? 0 : F.fx;
      var leg = { anchor: a, P0: p0.ok ? p0.value : null, P0Source: p0.ok ? p0.source : null, P0SourceDate: p0.ok ? p0.date || null : null, dutyCurrent: dc.v, dutyNew: o.dutyNew != null ? o.dutyNew : (z.dnew != null ? z.dnew : dc.v),
        worldPct: (z.world || 0) + (o.world || 0), discountPP: (z.disc || 0) + (o.prem || 0), licensingPP: m === 'silver' ? (z.lic || 0) + (o.lic || 0) : 0, lambda: F.lambda[horizon], fxPct: fx0 + (over.fx || 0) };
      info[m] = { anchor: a, p0: p0, duty: dc };
      if (metal === 'ratio') inp[m] = leg; else Object.assign(inp, leg);
    });
    inp.fxPct = (over.neutral ? 0 : F.fx) + (over.fx || 0);
    return { inp: inp, info: info };
  };
  UI.run = function (metal, horizon, over) {
    var b = UI.buildInputs(metal, horizon, over), legsM = metal === 'ratio' ? ['gold', 'silver'] : [metal];
    for (var i = 0; i < legsM.length; i++) {
      var m = legsM[i], inf = b.info[m];
      if (horizon !== '1Y' && !E.anchorOk(inf.anchor)) return { blocked: true, banner: E.BANNER_ANCHOR, reason: 'No current spot anchor for ' + m + ': load live_signals.json in Mode B, or enter spot value, date and basis.', info: b.info, inp: b.inp };
      if (inf.duty.v == null && inf.anchor) return { blocked: true, banner: 'DUTY IN FORCE ON ANCHOR DATE REQUIRED', reason: 'The SSOT duty schedule has no ad-valorem rate for ' + inf.anchor.date + ' (' + m + '); enter it.', info: b.info, inp: b.inp };
      if (inf.anchor && !inf.p0.ok) return { blocked: true, banner: 'P0 REQUIRED', reason: inf.p0.reason + ' (' + m + ')', info: b.info, inp: b.inp };
    }
    var r = E.forecast(b.inp, DB); r.info = b.info; r.inp = b.inp; return r;
  };
  UI.unitLabel = function (metal) { return E.UNITS[metal][UI.F.unit[metal]].label; };
  /** Display conversion: base unit → selected unit, plus optional known-purity scaling (999 ↔ 995). */
  UI.disp = function (v, metal, anchorBasis) {
    if (v == null) return null;
    var x = E.toUnit(v, metal, UI.F.unit[metal]);
    if (UI.F.purity !== 'asis' && metal !== 'ratio') { var pc = E.purityCode(anchorBasis); if (pc && pc !== UI.F.purity) x = E.purityScale(x, pc, UI.F.purity); }
    return x;
  };
  UI.fmtP = function (v, metal) { return metal === 'ratio' ? UI.num(v, 2) : UI.rs(v); };
})();
