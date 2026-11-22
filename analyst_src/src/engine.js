/* BullionEngine — PURE maths for the India Bullion Monitor & Predictor (SPEC v3.2 §3).
 * No DOM access. Runs in the browser (window.BullionEngine) and in Node (module.exports).
 * Unit conventions [HARD]: % shocks x enter as ln(1+x); premiums/duties are decimals (5% = 0.05);
 * pp offsets add to P directly (+4 pp = +0.04); everything is computed in log space, back via exp().
 * Functions needing SSOT data take `db` = the parsed F1 chart_data.json (or the embedded SSOT_DB).
 */
(function (root) {
  'use strict';
  var Z90 = 1.28155;                     // SPEC §3.5 (10th/90th percentile z)
  var T = { '1W': 1 / 52, '1M': 1 / 12, '1Y': 1 };
  var LAMBDA_DEFAULT = { '1W': 0, '1M': 0.5, '1Y': 1.0 };   // [USER-ASSUMPTION — not SSOT-calibrated]
  // Duty→premium equilibrium (SPEC §2, F1 duty_vs_premium_stats 2000-01..2025-26: gold 0.981/0.56, silver 0.825/3.10;
  // SPEC two-decimal values used for the default slope; intercepts cancel in P̂(Dnew) − P̂(Dcur)).
  var EQ = { gold: { slope: 0.98, intercept: 0.0056 }, silver: { slope: 0.83, intercept: 0.0310 } };
  var DESMOOTH = Math.sqrt(1.5);         // (b) working √(3/2) de-smoothing [THEORETICAL — not SSOT]
  var RHO_WF_FALLBACK = -0.40;           // SPEC §2 post-1990 world–rupee correlation
  var OZ_G = 31.1034768;
  var TOLA_FACTOR = 1.166380;            // Rs/10 g × 1.166380 = Rs/fine tola (tola 11.6638 g)
  var APR2026_P0 = { gold: 0.0561, silver: 0.0603 };   // RBI's last published premium (Apr 2026)
  var DUTY_HIKE_DATE = '2026-05-13';
  var MIN_LIVE = { '1W': 52, '1M': 24 };
  var MIN_SCORE = { '1W': 52, '1M': 24, '1Y': 10 };
  var NYM = 'NOT YET MEASURABLE';
  var BANNER_ANCHOR = 'CURRENT SPOT ANCHOR REQUIRED FOR 1W / 1M';
  var CAPTION_ACHIEVE = 'Theoretical ceiling for an unbiased log-normal forecast; ignores estimation error, fat tails and regime shifts.';

  // Ad-valorem duty in force (decimal) from dated F1 duty-history rows (gold_duty_history / silver_duty_history).
  // Only ad-valorem regimes (17 Jan 2012 onward) are machine-dated; earlier specific duties return null.
  // 'Jun 2013' and 'Jul 2019' have no day in F1: the 1st is assumed (as in F1's time-weighted duty equivalents).
  var DUTY_SCHEDULE = {
    gold: [['2012-01-17', 0.02], ['2012-03-17', 0.04], ['2013-01-21', 0.06], ['2013-06-01', 0.08], ['2013-08-13', 0.10],
      ['2019-07-01', 0.125], ['2021-02-02', 0.10], ['2022-07-01', 0.15], ['2023-02-02', 0.15], ['2024-07-24', 0.06], ['2026-05-13', 0.15]],
    silver: [['2012-01-17', 0.06], ['2013-08-13', 0.10], ['2019-07-01', 0.125], ['2021-02-02', 0.10], ['2023-02-02', 0.15],
      ['2024-07-24', 0.06], ['2026-05-13', 0.15]]
  };

  // ---------------------------------------------------------------- basic maths
  function ln1p(x) { return Math.log(1 + x); }
  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  function sd(a) { var m = mean(a), s = 0; for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / (a.length - 1)); }
  // Standard normal CDF (Hart 1968 / West 2005 double-precision algorithm, |err| < 1e-14)
  function Phi(x) {
    var X = Math.abs(x), c;
    if (X > 37) c = 0;
    else {
      var e = Math.exp(-X * X / 2), b;
      if (X < 7.07106781186547) {
        b = 3.52624965998911e-02 * X + 0.700383064443688; b = b * X + 6.37396220353165; b = b * X + 33.912866078383;
        b = b * X + 112.079291497871; b = b * X + 221.213596169931; b = b * X + 220.206867912376; c = e * b;
        b = 8.83883476483184e-02 * X + 1.75566716318264; b = b * X + 16.064177579207; b = b * X + 86.7807322029461;
        b = b * X + 296.564248779674; b = b * X + 637.333633378831; b = b * X + 793.826512519948; b = b * X + 440.413735824752;
        c = c / b;
      } else {
        b = X + 0.65; b = X + 4 / b; b = X + 3 / b; b = X + 2 / b; b = X + 1 / b; c = e / b / 2.506628274631;
      }
    }
    return x > 0 ? 1 - c : c;
  }
  // Linear-interpolation quantile (numpy default / Hyndman–Fan type 7)
  function quantile(arr, p) {
    var a = arr.slice().sort(function (x, y) { return x - y; }), h = (a.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return a[lo] + (h - lo) * (a[hi] - a[lo]);
  }
  // Covariance matrix, ddof = 1. rows: array of objects; keys: field names. Returns k×k array.
  function covMatrix(rows, keys, scale) {
    scale = scale == null ? 1 : scale;
    var k = keys.length, n = rows.length, m = keys.map(function (key) { return mean(rows.map(function (r) { return r[key] * scale; })); });
    var S = [];
    for (var i = 0; i < k; i++) {
      S.push([]);
      for (var j = 0; j < k; j++) {
        var s = 0;
        for (var t = 0; t < n; t++) s += (rows[t][keys[i]] * scale - m[i]) * (rows[t][keys[j]] * scale - m[j]);
        S[i].push(s / (n - 1));
      }
    }
    return S;
  }
  function quadForm(S, w) { var s = 0; for (var i = 0; i < w.length; i++) for (var j = 0; j < w.length; j++) s += w[i] * S[i][j] * w[j]; return s; }

  // ---------------------------------------------------------------- SSOT series accessors (read-only)
  var isRbiFy = function (t) { return typeof t === 'string' && t.indexOf('RBI FY') === 0; };
  function fyStart(fy) { return parseInt(String(fy).slice(0, 4), 10); }
  function fyEndDate(fy) { return (fyStart(fy) + 1) + '-03-31'; }
  /** Annual price series: master_yearly rows whose value_type starts with "RBI FY" (1970-71..2025-26). */
  function annualSeries(db, metal) {
    var vk = metal === 'gold' ? 'gold_rs_per_10g' : 'silver_rs_per_kg', tk = metal === 'gold' ? 'gold_value_type' : 'silver_value_type';
    var pk = metal === 'gold' ? 'gold_premium_pct_DERIVED' : 'silver_premium_pct_DERIVED';
    return db.master_yearly.filter(function (r) { return isRbiFy(r[tk]) && r[vk] != null; })
      .map(function (r) { return { fy: r.fiscal_year, date: fyEndDate(r.fiscal_year), value: r[vk], premium: r[pk] == null ? null : r[pk] / 100 }; })
      .sort(function (a, b) { return a.fy < b.fy ? -1 : a.fy > b.fy ? 1 : 0; });
  }
  /** RBI monthly averages (non-GAP months only). */
  function monthlySeries(db, metal) {
    var vk = metal === 'gold' ? 'gold_rs_10g' : 'silver_rs_kg', pk = metal === 'gold' ? 'gold_premium_pct_DERIVED' : 'silver_premium_pct_DERIVED';
    return db.monthly_2025_2026.filter(function (r) { return r[vk] != null; })
      .map(function (r) { return { month: r.month, date: monthEnd(r.month), value: r[vk], premium: r[pk] == null ? null : r[pk] / 100 }; })
      .sort(function (a, b) { return a.month < b.month ? -1 : 1; });
  }
  function monthEnd(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5, 7); var d = new Date(Date.UTC(y, m, 0)); return d.toISOString().slice(0, 10); }
  function post1990Rows(db) { return db.decomposition_log_points.filter(function (r) { return r.fiscal_year >= '1990-91'; }); }
  var KEYS3 = { gold: ['g_world', 'g_fx', 'g_prem'], silver: ['s_world', 's_fx', 's_prem'] };
  var KEYS6 = ['g_world', 'g_fx', 'g_prem', 's_world', 's_fx', 's_prem'];
  /** 3×3 covariance (world, rupee, premium) in log units (log-points/100), ddof=1, from 36 post-1990 rows (or given rows). */
  function ssotCov3(db, metal, rows) { return covMatrix(rows || post1990Rows(db), KEYS3[metal], 0.01); }
  /** 6×6 covariance (gold world/fx/prem, silver world/fx/prem). */
  function ssotCov6(db, rows) { return covMatrix(rows || post1990Rows(db), KEYS6, 0.01); }
  /** Annual σ = √(1ᵀΣ1) (log units). premVar=false drops premium variance (duty held fixed). metal may be 'ratio'. */
  function sigmaAnnualSSOT(db, metal, premVar, rows) {
    premVar = premVar !== false;
    if (metal === 'ratio') { var w6 = [1, 1, premVar ? 1 : 0, -1, -1, premVar ? -1 : 0]; return Math.sqrt(quadForm(ssotCov6(db, rows), w6)); }
    return Math.sqrt(quadForm(ssotCov3(db, metal, rows), [1, 1, premVar ? 1 : 0]));
  }
  /** Fixture D: INR log SD (log-points) = √(1ᵀΣ1)×100 and SD of the printed total column. */
  function fixtureD(db) {
    var rows = post1990Rows(db);
    return {
      n: rows.length,
      gold_sigma_lp: 100 * sigmaAnnualSSOT(db, 'gold', true), silver_sigma_lp: 100 * sigmaAnnualSSOT(db, 'silver', true),
      gold_sd_total_lp: sd(rows.map(function (r) { return r.g_total; })), silver_sd_total_lp: sd(rows.map(function (r) { return r.s_total; }))
    };
  }
  /** Post-1990 average yearly log change (log units), from F1 rows. metal may be 'ratio'. */
  function trendPost1990(db, metal) {
    var rows = post1990Rows(db);
    if (metal === 'ratio') return mean(rows.map(function (r) { return (r.g_total - r.s_total) / 100; }));
    var k = metal === 'gold' ? 'g_total' : 's_total';
    return mean(rows.map(function (r) { return r[k] / 100; }));
  }
  function empiricalLogChanges(db, metal) {
    return post1990Rows(db).map(function (r) { return metal === 'ratio' ? (r.g_total - r.s_total) / 100 : r[metal === 'gold' ? 'g_total' : 's_total'] / 100; });
  }

  // ---------------------------------------------------------------- duty helpers
  function dutyInForce(metal, date) {
    var s = DUTY_SCHEDULE[metal], v = null;
    if (!s || !date || date < s[0][0]) return null;
    for (var i = 0; i < s.length; i++) if (s[i][0] <= date) v = s[i][1];
    return v;
  }
  function dutyAvg(metal, from, to) { // day-weighted average over [from,to] inclusive; null if any day unknown
    var a = new Date(from + 'T00:00:00Z'), b = new Date(to + 'T00:00:00Z'), s = 0, n = 0;
    for (var d = a; d <= b; d = new Date(d.getTime() + 864e5)) { var v = dutyInForce(metal, d.toISOString().slice(0, 10)); if (v == null) return null; s += v; n++; }
    return s / n;
  }
  /** OLS fit premium% = a + b·duty% over F1 duty_vs_premium rows FY 2000-01..maxFy (walk-forward slope). */
  function eqFit(db, metal, maxFy) {
    var dk = metal === 'gold' ? 'gold_duty_ad_valorem_equiv_pct' : 'silver_duty_ad_valorem_equiv_pct', pk = metal === 'gold' ? 'gold_premium_pct' : 'silver_premium_pct';
    var rows = db.duty_vs_premium.filter(function (r) { return r.fiscal_year >= '2000-01' && (!maxFy || r.fiscal_year <= maxFy) && r[dk] != null && r[pk] != null; });
    if (rows.length < 5) return null;
    var x = rows.map(function (r) { return r[dk]; }), y = rows.map(function (r) { return r[pk]; }), mx = mean(x), my = mean(y), sxy = 0, sxx = 0;
    for (var i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) * (x[i] - mx); }
    if (sxx === 0) return null;
    return { slope: sxy / sxx, intercept: my - (sxy / sxx) * mx, n: rows.length };
  }

  // ---------------------------------------------------------------- §3.2 premium path, gates
  /** P_h = P0 + λ·(P̂eq(Dnew) − P̂eq(Dcur)) + Δdiscount + ΔsilverLicensing (all decimals). */
  function premiumPath(o) {
    var slope = o.slope != null ? o.slope : EQ[o.metal].slope;
    var dCur = o.dutyCurrent == null ? 0 : o.dutyCurrent, dNew = o.dutyNew == null ? dCur : o.dutyNew;
    var dutyPart = o.lambda * slope * (dNew - dCur);   // P̂eq(D) = slope·D + intercept → intercept cancels
    var offsets = (o.discountPP || 0) + (o.licensingPP || 0);
    return { Ph: o.P0 + dutyPart + offsets, dutyPart: dutyPart, offsets: offsets, slope: slope };
  }
  function anchorOk(a) { return !!(a && isFinite(a.value) && a.value > 0 && a.date && a.basis && a.kind !== 'SSOT-BENCHMARK'); }
  /** G4: returns {ok, value, source} or {ok:false, reason}. Never defaults to the Apr-2026 RBI premium for a post-13-May-2026 anchor. */
  function resolveP0(o) {
    // o: {metal, anchorDate, live (decimal|null), user (decimal|null), prefer:'live'|'user', ssotMatched (decimal|null)}
    var post = o.anchorDate && o.anchorDate >= DUTY_HIKE_DATE;
    var cands = o.prefer === 'user' ? [['user', o.user], ['live', o.live]] : [['live', o.live], ['user', o.user]];
    for (var i = 0; i < cands.length; i++) if (cands[i][1] != null && isFinite(cands[i][1])) return { ok: true, value: cands[i][1], source: cands[i][0] };
    if (o.ssotMatched != null && !post && o.allowSsotMatched) return { ok: true, value: o.ssotMatched, source: 'ssot-matched', date: o.ssotDate || null };
    return { ok: false, reason: post ? 'P0 REQUIRED: anchor dates from after 13 May 2026; the Apr 2026 RBI premium may not be used. Enter the current premium or load live data.' : 'P0 REQUIRED: enter the current domestic premium (live or user entry).' };
  }

  // ---------------------------------------------------------------- §3.4 volatility
  /** Daily log returns between consecutive rows with gap ≤ maxGapDays. */
  function dailyReturns(series, field, maxGapDays) {
    maxGapDays = maxGapDays || 5;
    var rows = series.filter(function (r) { return r[field] != null && isFinite(r[field]) && r[field] > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var g = (new Date(rows[i].date) - new Date(rows[i - 1].date)) / 864e5;
      if (g > 0 && g <= maxGapDays) out.push({ date: rows[i].date, r: Math.log(rows[i][field] / rows[i - 1][field]) });
    }
    return out;
  }
  /** Realised annualised vol from live_history series (√252), window default 90, min 60 returns. null if insufficient. */
  function realizedVol(series, field, opt) {
    opt = opt || {}; var win = opt.window || 90, min = opt.min || 60;
    var r = dailyReturns(series || [], field, opt.maxGapDays).slice(-win);
    if (r.length < min) return { vol: null, n: r.length, reason: 'fewer than ' + min + ' daily returns' };
    return { vol: sd(r.map(function (x) { return x.r; })) * Math.sqrt(252), n: r.length };
  }
  function realizedCorr(series, f1, f2, opt) {
    opt = opt || {}; var min = opt.min || 60;
    var a = dailyReturns(series || [], f1, opt.maxGapDays), b = dailyReturns(series || [], f2, opt.maxGapDays), mb = {};
    b.forEach(function (x) { mb[x.date] = x.r; });
    var p = a.filter(function (x) { return mb[x.date] != null; }).slice(-(opt.window || 90));
    if (p.length < min) return { rho: null, n: p.length };
    var xa = p.map(function (x) { return x.r; }), xb = p.map(function (x) { return mb[x.date]; }), ma = mean(xa), mbb = mean(xb), s = 0, sa = 0, sb = 0;
    for (var i = 0; i < xa.length; i++) { s += (xa[i] - ma) * (xb[i] - mbb); sa += Math.pow(xa[i] - ma, 2); sb += Math.pow(xb[i] - mbb, 2); }
    return { rho: s / Math.sqrt(sa * sb), n: p.length };
  }
  /** Daily premium rows: Indian ÷ (world × INR × unit factor) − 1, same date; rows whose time_basis states a gap/mismatch are excluded. */
  function dailyPremiumRows(series, metal) {
    var ik = metal === 'gold' ? 'in_gold_rs_10g' : 'in_silver_rs_kg', wk = metal === 'gold' ? 'world_gold_usd' : 'world_silver_usd', f = metal === 'gold' ? 10 / OZ_G : 1000 / OZ_G;
    var ok = [], flagged = [];
    (series || []).forEach(function (r) {
      if (r[ik] == null || r[wk] == null || r.inr_usd == null) return;
      var p = r[ik] / (r[wk] * r.inr_usd * f) - 1, row = { date: r.date, premium: p };
      if (/gap|mismatch/i.test(r.time_basis || '')) flagged.push(row); else ok.push(row);
    });
    return { ok: ok, flagged: flagged };
  }
  /**
   * Annual-equivalent σ for a vol mode, then ×√T. Returns {sigma, sigmaAnnual, label, available, warn}.
   * mode 'a' SSOT annual averages; 'b' = (a)×√1.5; 'c' realised spot vol (live), hybrid premium from SSOT.
   * live: {world_vol, inr_vol, rho, world_vol_silver?, n} (annualised decimals) — only used in mode c.
   */
  function sigmaFor(db, metal, horizon, mode, premVar, live) {
    var t = T[horizon], warn = [];
    premVar = premVar !== false;
    if (mode === 'a' || mode === 'b') {
      var sa = sigmaAnnualSSOT(db, metal, premVar);
      if (horizon !== '1Y') warn.push('annual averages smooth spot moves and understate short-term risk.');
      var f = mode === 'b' ? DESMOOTH : 1;
      return { available: true, sigmaAnnual: sa * f, sigma: sa * f * Math.sqrt(t), label: mode === 'b' ? '(b) √(3/2) de-smoothed SSOT [THEORETICAL — not SSOT]' : '(a) SSOT annual-average volatility, 36 post-1990 rows', warn: warn };
    }
    // mode c
    live = live || {};
    if (metal === 'ratio') {
      if (live.world_vol_gold == null || live.world_vol_silver == null || live.rho_gold_silver == null)
        return { available: false, reason: 'Mode (c) for the ratio needs live realised gold and silver world vol and their correlation (≥ 60 daily returns); not available.', warn: warn };
      var vr = Math.pow(live.world_vol_gold, 2) + Math.pow(live.world_vol_silver, 2) - 2 * live.rho_gold_silver * live.world_vol_gold * live.world_vol_silver;
      var S6 = ssotCov6(db); var pv = premVar ? S6[2][2] + S6[5][5] : 0;
      var s2 = Math.sqrt(vr + pv);
      return { available: true, sigmaAnnual: s2, sigma: s2 * Math.sqrt(t), label: '(c) realised spot vol [HYBRID — premium vol from annual averages]', warn: warn };
    }
    var wv = metal === 'gold' ? live.world_vol_gold : live.world_vol_silver;
    if (wv == null || live.inr_vol == null) return { available: false, reason: 'Mode (c) needs live realised world ' + metal + ' and INR/USD vol from ≥ 60 daily returns in live_history.json; world vol is not available.', warn: warn };
    var rho = live.rho != null ? live.rho : RHO_WF_FALLBACK;
    var v = wv * wv + live.inr_vol * live.inr_vol + 2 * rho * wv * live.inr_vol;
    var lbl = '(c) realised spot vol';
    if (live.premium_vol != null) { if (premVar) v += live.premium_vol * live.premium_vol; lbl += ' (daily premium covariance)'; }
    else { if (premVar) v += ssotCov3(db, metal)[2][2]; lbl += ' [HYBRID — premium vol from annual averages]'; }
    if (live.rho == null) lbl += '; ρ(world, rupee) = −0.40 SSOT fallback';
    return { available: true, sigmaAnnual: Math.sqrt(v), sigma: Math.sqrt(v) * Math.sqrt(t), label: lbl, warn: warn };
  }

  // ---------------------------------------------------------------- §3.1/3.3/3.5 forecast
  function legLogs(leg, horizon, metal, trendMode, db, trendRate) {
    var lam = leg.lambda != null ? leg.lambda : LAMBDA_DEFAULT[horizon];
    var pp = premiumPath({ metal: metal, P0: leg.P0, dutyCurrent: leg.dutyCurrent, dutyNew: leg.dutyNew, lambda: lam, slope: leg.slope, discountPP: leg.discountPP, licensingPP: leg.licensingPP });
    var dlnW = ln1p(leg.worldPct || 0), dlnF = ln1p(leg.fxPct || 0);
    var dlnPrem = Math.log((1 + pp.Ph) / (1 + leg.P0));
    var dlnDuty = Math.log((1 + leg.P0 + pp.dutyPart) / (1 + leg.P0));
    var dlnOff = Math.log((1 + pp.Ph) / (1 + leg.P0 + pp.dutyPart));
    var tr = trendMode === 'post1990' ? (trendRate != null ? trendRate : trendPost1990(db, metal)) * T[horizon] : 0;
    return { lambda: lam, Ph: pp.Ph, slope: pp.slope, dutyPart: pp.dutyPart, offsets: pp.offsets, dlnWorld: dlnW, dlnFx: dlnF, dlnPrem: dlnPrem, dlnPremDuty: dlnDuty, dlnPremOffsets: dlnOff, dlnTrend: tr };
  }
  /**
   * forecast(inp, db)
   * inp: {metal:'gold'|'silver'|'ratio', horizon:'1W'|'1M'|'1Y',
   *       anchor:{value, date:'YYYY-MM-DD', basis, kind:'LIVE'|'USER'|'SSOT-BENCHMARK', label}  (or spot/anchorDate/anchorBasis),
   *       P0, P0Source, dutyCurrent, dutyNew, lambda, slope, worldPct, fxPct, discountPP, licensingPP,
   *       trend:'zero'|'post1990', volMode:'a'|'b'|'c', premVar:true, dist:'lognormal'|'empirical', live:{...}, sigma (override)}
   *  ratio: inp.gold / inp.silver = per-leg {anchor, P0, dutyCurrent, dutyNew, worldPct, discountPP, licensingPP}; inp.fxPct shared.
   */
  function forecast(inp, db) {
    var h = inp.horizon, metal = inp.metal, t = T[h];
    if (!t) throw new Error('horizon must be 1W, 1M or 1Y');
    var legs = metal === 'ratio' ? ['gold', 'silver'] : [metal], L = {}, res = { metal: metal, horizon: h, T: t, blocked: false, notes: [] };
    for (var i = 0; i < legs.length; i++) {
      var m = legs[i], src = metal === 'ratio' ? Object.assign({ fxPct: inp.fxPct, lambda: inp.lambda }, inp[m] || {}) : inp;
      var a = src.anchor || (src.spot != null ? { value: src.spot, date: src.anchorDate || inp.anchorDate || 'unspecified', basis: src.anchorBasis || inp.anchorBasis || 'user-stated', kind: 'USER' } : null);
      // G3 gate
      if (h !== '1Y' && !anchorOk(a)) return { metal: metal, horizon: h, blocked: true, banner: BANNER_ANCHOR, reason: 'No current spot anchor (live or user-entered with date + basis) for ' + m + '.' };
      if (h === '1Y' && !(a && isFinite(a.value) && a.value > 0)) return { metal: metal, horizon: h, blocked: true, banner: 'ANCHOR REQUIRED', reason: 'Choose a current spot or a labelled SSOT benchmark for ' + m + '.' };
      // G4 gate
      if (src.P0 == null || !isFinite(src.P0)) return { metal: metal, horizon: h, blocked: true, banner: 'P0 REQUIRED', reason: 'Starting premium P0 for ' + m + ' is required (live or user entry).' };
      var post = a.date && a.date >= DUTY_HIKE_DATE;
      if (post && src.P0Source !== 'user' && src.P0Source !== 'live' && Math.abs(src.P0 - APR2026_P0[m]) < 1e-12)
        return { metal: metal, horizon: h, blocked: true, banner: 'P0 REQUIRED', reason: 'Apr 2026 RBI premium cannot be the default P0 for an anchor after 13 May 2026.' };
      // G4 provenance: an SSOT-sourced P0, or any P0 dated before 13 May 2026, may not start a post-13-May anchor
      if (post && (/^ssot/i.test(String(src.P0Source || '')) || (src.P0SourceDate && src.P0SourceDate < DUTY_HIKE_DATE)))
        return { metal: metal, horizon: h, blocked: true, banner: 'P0 REQUIRED', reason: 'P0 source (' + (src.P0Source || '?') + (src.P0SourceDate ? ', dated ' + src.P0SourceDate : '') + ') predates the 13 May 2026 duty change but the anchor is dated ' + a.date + '; enter the current premium.' };
      L[m] = legLogs(src, h, m, inp.trend, db, src.trendRate);
      L[m].anchor = a; L[m].P0 = src.P0; L[m].P0Source = src.P0Source || 'user'; L[m].P0SourceDate = src.P0SourceDate || null;
    }
    var c = {};
    ['dlnWorld', 'dlnFx', 'dlnPrem', 'dlnPremDuty', 'dlnPremOffsets', 'dlnTrend'].forEach(function (k) {
      c[k] = metal === 'ratio' ? L.gold[k] - L.silver[k] : L[metal][k];
    });
    var anchorValue = metal === 'ratio' ? L.gold.anchor.value * 100 / L.silver.anchor.value : L[metal].anchor.value;
    var mu = c.dlnWorld + c.dlnFx + c.dlnPrem + c.dlnTrend;
    var sig;
    if (inp.sigma != null) sig = { available: true, sigma: inp.sigma, sigmaAnnual: inp.sigma / Math.sqrt(t), label: 'user-supplied σ', warn: [] };
    else sig = sigmaFor(db, metal, h, inp.volMode || (h === '1Y' ? 'a' : 'a'), inp.premVar, inp.live);
    var base = anchorValue * Math.exp(mu);
    Object.assign(res, c, { legs: L, anchorValue: anchorValue, dln: mu, mu: mu, base: base, pctChange: Math.exp(mu) - 1, sigmaInfo: sig });
    // §3.1 identity residual — code-sanity check only (holds by construction)
    res.residual = Math.log(base / anchorValue) - (c.dlnWorld + c.dlnFx + c.dlnPrem + c.dlnTrend);
    if (!sig.available) { res.rangeUnavailable = sig.reason; res.sigma = null; res.bear = null; res.bull = null; return res; }
    res.sigma = sig.sigma;
    var dist = inp.dist || 'lognormal';
    if (dist === 'empirical' && h === '1Y') {
      var e = empiricalLogChanges(db, metal), me = mean(e);
      res.q10 = quantile(e, 0.10); res.q90 = quantile(e, 0.90);
      res.bear = base * Math.exp(res.q10 - me); res.bull = base * Math.exp(res.q90 - me);
      res.distLabel = 'Empirical 10th/90th percentiles of 36 post-1990 yearly log-changes (demeaned), shifted by the scenario';
    } else {
      if (dist === 'empirical') res.notes.push('Empirical ranges exist for 1Y only; log-normal used.');
      res.bear = base * Math.exp(-Z90 * sig.sigma); res.bull = base * Math.exp(Z90 * sig.sigma);
      res.distLabel = 'Log-normal, 10th–90th percentile (z = ±1.28155)';
    }
    return res;
  }

  // ---------------------------------------------------------------- achievability meter
  function clampTol(tol) { tol = +tol; if (!isFinite(tol)) tol = 0.10; return Math.min(0.5, Math.max(0.005, tol)); }
  function hitProb(sigma, tol) { tol = clampTol(tol); if (!(sigma > 0)) return 1; return Phi(Math.log(1 + tol) / sigma) - Phi(Math.log(1 - tol) / sigma); }
  function achievability(sigma, tol, target) {
    var tl = clampTol(tol), tg = target == null || !isFinite(+target) ? 0.9 : Math.min(1, Math.max(0, +target));
    var p = hitProb(sigma, tl);
    return { p: p, tol: tl, target: tg, label: p >= tg ? 'achievable' : p >= tg - 0.05 ? 'borderline' : 'not achievable', caption: CAPTION_ACHIEVE };
  }

  // ---------------------------------------------------------------- §3.6 backtests (walk-forward)
  function metrics(points, model, tol) {
    var ok = points.filter(function (p) { return p.f[model] != null; });
    if (!ok.length) return { n: 0 };
    var errs = ok.map(function (p) { return p.actual / p.f[model] - 1; });
    var hits = errs.filter(function (e) { return Math.abs(e) <= tol; }).length;
    var cov = ok.filter(function (p) { return p.range && p.range[model]; });
    var inR = cov.filter(function (p) { return p.actual >= p.range[model][0] && p.actual <= p.range[model][1]; }).length;
    return { n: ok.length, hits: hits, hitRate: hits / ok.length, mae: mean(errs.map(Math.abs)), coverage: cov.length ? inR / cov.length : null, nCoverage: cov.length };
  }
  function summarise(points, tol, models) {
    var out = {}, m0 = metrics(points, 'M0', tol);
    models.forEach(function (m) {
      var r = metrics(points, m, tol);
      r.skill = r.n ? (m === 'M0' ? 0 : 1 - r.mae / m0.mae) : null;
      r.naive = { hitRate: m0.hitRate, mae: m0.mae, n: m0.n };
      out[m] = r;
    });
    return out;
  }
  /**
   * Yearly 1Y backtest on the SSOT annual series (55 transitions). Expanding window starts after ≥ minYears (10) log changes.
   * Every forecast at origin i uses only rows with FY ≤ origin FY (prices, decomposition rows, duty table).
   */
  function backtestYearly(db, metal, opt) {
    opt = opt || {}; var tol = clampTol(opt.tol == null ? 0.10 : opt.tol), minY = opt.minYears || 10, win = opt.covWindow || 10;
    var s = annualSeries(db, metal), pts = [], dec = db.decomposition_log_points, lam = opt.lambda != null ? opt.lambda : LAMBDA_DEFAULT['1Y'];
    for (var i = minY; i < s.length - 1; i++) pts.push(forecastAtOrigin(db, metal, s, i, { lambda: lam, covWindow: win, dec: dec }));
    return { dataset: 'SSOT yearly (RBI FY averages)', horizon: '1Y', metal: metal, tol: tol, n: pts.length, points: pts, summary: summarise(pts, tol, ['M0', 'M1', 'M2', 'M3']), label: 'yearly averages vs yearly averages, not spot' };
  }
  /** Forecast made at origin index i of the annual series, using only data up to that origin (no look-ahead). */
  function forecastAtOrigin(db, metal, s, i, o) {
    var hist = s.slice(0, i + 1), P = hist[i].value, ofy = hist[i].fy;
    var lc = []; for (var k = 1; k < hist.length; k++) lc.push(Math.log(hist[k].value / hist[k - 1].value));
    var m1 = P * Math.exp(mean(lc));
    // M2: duty changes enacted on or before the FY end (origin); ex-ante end-of-year duty vs FY average duty
    var m2 = m1, dEnd = dutyInForce(metal, fyEndDate(ofy)), dAvg = null, fit = null;
    var dvp = db.duty_vs_premium.filter(function (r) { return r.fiscal_year === ofy; })[0];
    if (dvp) dAvg = dvp[metal === 'gold' ? 'gold_duty_ad_valorem_equiv_pct' : 'silver_duty_ad_valorem_equiv_pct'];
    if (dEnd != null && dAvg != null && hist[i].premium != null) {
      fit = eqFit(db, metal, ofy);
      if (fit) { var P0 = hist[i].premium, dp = (o.lambda * fit.slope * (dEnd * 100 - dAvg)) / 100; m2 = m1 * (1 + P0 + dp) / (1 + P0); }
    }
    // M3: rolling-window covariance (last covWindow decomposition rows with FY ≤ origin)
    var rows = (o.dec || []).filter(function (r) { return r.fiscal_year <= ofy; }).slice(-o.covWindow), sig = null;
    if (rows.length >= Math.min(o.covWindow, 3)) sig = Math.sqrt(quadForm(covMatrix(rows, KEYS3[metal], 0.01), [1, 1, 1]));
    var rng = sig == null ? null : { M0: [P * Math.exp(-Z90 * sig), P * Math.exp(Z90 * sig)], M1: [m1 * Math.exp(-Z90 * sig), m1 * Math.exp(Z90 * sig)], M2: [m2 * Math.exp(-Z90 * sig), m2 * Math.exp(Z90 * sig)] };
    if (rng) rng.M3 = rng.M1;
    return { origin: ofy, target: s[i + 1].fy, actual: s[i + 1].value, f: { M0: P, M1: m1, M2: m2, M3: m1 }, range: rng, sigma: sig, dutyEnd: dEnd, dutyAvgPct: dAvg, eqSlope: fit && fit.slope };
  }
  /** Monthly 1M backtest on RBI monthly averages (19 transitions). Trend and σ from annual rows with FY end ≤ origin month. */
  function backtestMonthly(db, metal, opt) {
    opt = opt || {}; var tol = clampTol(opt.tol == null ? 0.10 : opt.tol), lam = opt.lambda != null ? opt.lambda : LAMBDA_DEFAULT['1M'], win = opt.covWindow || 10;
    var s = monthlySeries(db, metal), ann = annualSeries(db, metal), pts = [];
    for (var i = 0; i < s.length - 1; i++) {
      var o = s[i], t0 = o.date, P = o.value;
      var annK = ann.filter(function (r) { return r.date <= t0; });
      var lc = []; for (var k = 1; k < annK.length; k++) lc.push(Math.log(annK[k].value / annK[k - 1].value));
      var m1 = P * Math.exp(mean(lc) / 12);
      var dEnd = dutyInForce(metal, t0), dAvg = dutyAvg(metal, o.month + '-01', t0), m2 = m1;
      var lastFy = annK.length ? annK[annK.length - 1].fy : null, fit = lastFy ? eqFit(db, metal, lastFy) : null;
      var prem = null; for (var q = i; q >= 0; q--) if (s[q].premium != null) { prem = s[q].premium; break; }
      if (dEnd != null && dAvg != null && fit && prem != null && Math.abs(dEnd - dAvg) > 1e-12) { var dp = lam * fit.slope * (dEnd - dAvg); m2 = m1 * (1 + prem + dp) / (1 + prem); }
      var rows = db.decomposition_log_points.filter(function (r) { return fyEndDate(r.fiscal_year) <= t0; }).slice(-win);
      var sig = rows.length >= 3 ? Math.sqrt(quadForm(covMatrix(rows, KEYS3[metal], 0.01), [1, 1, 1]) / 12) : null;
      var rng = sig == null ? null : { M0: [P * Math.exp(-Z90 * sig), P * Math.exp(Z90 * sig)], M1: [m1 * Math.exp(-Z90 * sig), m1 * Math.exp(Z90 * sig)], M2: [m2 * Math.exp(-Z90 * sig), m2 * Math.exp(Z90 * sig)] };
      if (rng) rng.M3 = rng.M1;
      pts.push({ origin: o.month, target: s[i + 1].month, actual: s[i + 1].value, f: { M0: P, M1: m1, M2: m2, M3: m1 }, range: rng, sigma: sig });
    }
    var res = { dataset: 'SSOT monthly (RBI monthly averages)', horizon: '1M', metal: metal, tol: tol, n: pts.length, points: pts, summary: summarise(pts, tol, ['M0', 'M1', 'M2', 'M3']), label: 'monthly averages vs monthly averages, not spot' };
    if (pts.length < 24) res.label += '; indicative: small sample';
    return res;
  }
  /**
   * Live daily backtest (1W/1M) on Indian spot from live_history.json, non-overlapping windows only.
   * Below 52 weekly / 24 monthly test points → status NOT YET MEASURABLE and no numbers.
   */
  function backtestLive(history, metal, horizon, opt) {
    opt = opt || {}; var tol = clampTol(opt.tol == null ? 0.10 : opt.tol), field = metal === 'gold' ? 'in_gold_rs_10g' : 'in_silver_rs_kg';
    var days = horizon === '1W' ? 7 : 30, slack = horizon === '1W' ? 3 : 5, min = MIN_LIVE[horizon];
    var rows = ((history && history.series) || []).filter(function (r) { return r[field] != null && r[field] > 0; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var pts = [], i = 0;
    while (i < rows.length) {
      var t0 = new Date(rows[i].date), want = new Date(t0.getTime() + days * 864e5), j = -1;
      for (var k = i + 1; k < rows.length; k++) { var dk = new Date(rows[k].date); if (dk >= want) { if ((dk - want) / 864e5 <= slack) j = k; break; } }
      if (j < 0) { i++; continue; }
      pts.push({ origin: rows[i].date, target: rows[j].date, actual: rows[j][field], f: { M0: rows[i][field] }, range: null });
      i = j; // non-overlapping
    }
    var res = { dataset: 'Live daily history (fetcher)', horizon: horizon, metal: metal, tol: tol, n: pts.length, min: min, points: pts };
    if (pts.length < min) { res.status = NYM; res.summary = null; } else { res.status = 'OK'; res.summary = summarise(pts, tol, ['M0']); }
    return res;
  }
  /** No-change (M0) hit rates within ±tol: 1M monthly, 1Y all / post-1990 / last 10 (SPEC §2 benchmark table). */
  function naiveBenchmarks(db, tol) {
    tol = clampTol(tol == null ? 0.10 : tol);
    var out = {};
    ['gold', 'silver'].forEach(function (m) {
      var rate = function (s) { var h = 0, n = 0; for (var i = 1; i < s.length; i++) { n++; if (Math.abs(s[i].value / s[i - 1].value - 1) <= tol) h++; } return { n: n, hits: h, rate: n ? h / n : null }; };
      var a = annualSeries(db, m), p90 = a.filter(function (r) { return r.fy >= '1989-90'; });
      out[m] = { m1: rate(monthlySeries(db, m)), y_all: rate(a), y_post1990: rate(p90), y_last10: rate(a.slice(-11)) };
    });
    return out;
  }

  // ---------------------------------------------------------------- live scorecard
  /** Score saved forecasts against later live rows: first row with a price on/after target date (≤ 5 days later). */
  function scoreForecasts(entries, history, tol) {
    var series = ((history && history.series) || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return (entries || []).map(function (e) {
      if (e.status === 'SCORED') return e;
      var get = function (m) {
        var f = m === 'gold' ? 'in_gold_rs_10g' : 'in_silver_rs_kg';
        for (var i = 0; i < series.length; i++) { var r = series[i]; if (r.date >= e.target_date && r[f] != null) return (new Date(r.date) - new Date(e.target_date)) / 864e5 <= 5 ? { v: r[f], d: r.date } : null; }
        return null;
      };
      var act;
      if (e.metal === 'ratio') { var g = get('gold'), s = get('silver'); act = g && s ? { v: g.v * 100 / s.v, d: g.d } : null; } else act = get(e.metal);
      if (!act) return e;
      var t = clampTol(tol == null ? e.tol : tol), err = act.v / e.base - 1, nerr = act.v / e.anchor.value - 1;
      return Object.assign({}, e, { status: 'SCORED', actual: act.v, actual_date: act.d, err: err, hit: Math.abs(err) <= t, in_range: e.bear != null && act.v >= e.bear && act.v <= e.bull, naive_err: nerr, naive_hit: Math.abs(nerr) <= t });
    });
  }
  function scorecardSummary(entries, horizon) {
    var s = (entries || []).filter(function (e) { return e.status === 'SCORED' && e.horizon === horizon; }), min = MIN_SCORE[horizon];
    if (s.length < min) return { n: s.length, min: min, status: NYM };
    var hr = s.filter(function (e) { return e.hit; }).length / s.length, nh = s.filter(function (e) { return e.naive_hit; }).length / s.length;
    return { n: s.length, min: min, status: 'OK', hitRate: hr, naiveHitRate: nh, coverage: s.filter(function (e) { return e.in_range; }).length / s.length };
  }

  // ---------------------------------------------------------------- units (allowed conversions only, G5)
  var UNITS = {
    gold: { rs_10g: { label: 'Rs/10 g', f: 1 }, rs_g: { label: 'Rs/g', f: 0.1 }, rs_tola: { label: 'Rs/fine tola', f: TOLA_FACTOR } },
    silver: { rs_kg: { label: 'Rs/kg', f: 1 }, rs_10g: { label: 'Rs/10 g', f: 0.01 }, rs_100tola: { label: 'Rs/100 tolas', f: TOLA_FACTOR } },
    ratio: { ratio: { label: 'g silver per g gold', f: 1 } }
  };
  /** Convert from base unit (gold Rs/10 g, silver Rs/kg) to `unit`. */
  function toUnit(v, metal, unit) { var u = UNITS[metal] && UNITS[metal][unit]; if (!u) throw new Error('conversion not allowed: ' + metal + ' ' + unit); return v == null ? null : v * u.f; }
  function fromUnit(v, metal, unit) { var u = UNITS[metal] && UNITS[metal][unit]; if (!u) throw new Error('conversion not allowed: ' + metal + ' ' + unit); return v == null ? null : v / u.f; }
  /** Known-purity scaling only (999 ↔ 995). RBI Standard Gold / unstated purity → throws (G5). */
  function purityScale(v, from, to) {
    var ok = { '999': 999, '995': 995 }; if (!ok[from] || !ok[to]) throw new Error('purity scaling only between known 999 and 995 (RBI Standard Gold purity is not stated)');
    return v * ok[to] / ok[from];
  }
  function purityCode(basis) { var m = /\b(999|995)\b/.exec(String(basis || '')); return m ? m[1] : null; }

  // ---------------------------------------------------------------- fixtures (audit check 3)
  function runFixtures(db) {
    var A = [0, 0.25, 1].map(function (l) { return forecast({ metal: 'gold', horizon: '1W', spot: 145000, anchorDate: '2026-11-19', anchorBasis: '999 (fixture)', P0: 0.05, dutyCurrent: 0.15, dutyNew: 0.15, lambda: l, worldPct: 0.02, fxPct: 0.005, discountPP: 0, licensingPP: 0, trend: 'zero', volMode: 'a' }, db); });
    var B = forecast({ metal: 'silver', horizon: '1M', spot: 235000, anchorDate: '2026-11-19', anchorBasis: '999 (fixture)', P0: 0.06, dutyCurrent: 0.15, dutyNew: 0.15, worldPct: -0.05, fxPct: 0.01, licensingPP: 0.04, trend: 'zero', volMode: 'a' }, db);
    var C = forecast({ metal: 'gold', horizon: '1Y', spot: 140240, anchorDate: '2026-11-19', anchorBasis: '999', P0: 0.12, dutyCurrent: 0.15, dutyNew: 0.06, lambda: 1, worldPct: 0, fxPct: 0, trend: 'zero', volMode: 'a', premVar: true }, db);
    var D = fixtureD(db);
    var bt = backtestYearly(db, 'gold');
    var E = {
      tol0: clampTol(0), tol1: clampTol(1), p_tol0: hitProb(0.1, 0), p_tol1: hitProb(0.1, 1),
      gate1W: forecast({ metal: 'gold', horizon: '1W', P0: 0.05 }, db),
      m0_skill_yearly_gold: bt.summary.M0.skill,
      live_weekly: backtestLive({ series: [] }, 'gold', '1W').status
    };
    return {
      A: A.map(function (r) { return { lambda: r.legs.gold.lambda, dln: r.dln, base: r.base }; }),
      B: { dln: B.dln, base: B.base, Ph: B.legs.silver.Ph },
      C: { Ph: C.legs.gold.Ph, dlnPrem: C.dlnPrem, base: C.base, sigma: C.sigma, bear: C.bear, bull: C.bull },
      D: D,
      E: { tol0: E.tol0, tol1: E.tol1, p_tol0: E.p_tol0, p_tol1: E.p_tol1, gate1W_blocked: E.gate1W.blocked, gate1W_banner: E.gate1W.banner, m0_skill: E.m0_skill_yearly_gold, live_weekly_status: E.live_weekly }
    };
  }

  var API = {
    version: '3.2.0', Z90: Z90, T: T, LAMBDA_DEFAULT: LAMBDA_DEFAULT, EQ: EQ, DESMOOTH: DESMOOTH, RHO_WF_FALLBACK: RHO_WF_FALLBACK, TOLA_FACTOR: TOLA_FACTOR,
    APR2026_P0: APR2026_P0, DUTY_HIKE_DATE: DUTY_HIKE_DATE, DUTY_SCHEDULE: DUTY_SCHEDULE, MIN_LIVE: MIN_LIVE, MIN_SCORE: MIN_SCORE, NYM: NYM,
    BANNER_ANCHOR: BANNER_ANCHOR, CAPTION_ACHIEVE: CAPTION_ACHIEVE, UNITS: UNITS,
    ln1p: ln1p, mean: mean, sd: sd, Phi: Phi, quantile: quantile, covMatrix: covMatrix, quadForm: quadForm,
    annualSeries: annualSeries, monthlySeries: monthlySeries, post1990Rows: post1990Rows, ssotCov3: ssotCov3, ssotCov6: ssotCov6,
    sigmaAnnualSSOT: sigmaAnnualSSOT, fixtureD: fixtureD, trendPost1990: trendPost1990, empiricalLogChanges: empiricalLogChanges,
    dutyInForce: dutyInForce, dutyAvg: dutyAvg, eqFit: eqFit, premiumPath: premiumPath, anchorOk: anchorOk, resolveP0: resolveP0,
    dailyReturns: dailyReturns, realizedVol: realizedVol, realizedCorr: realizedCorr, dailyPremiumRows: dailyPremiumRows, sigmaFor: sigmaFor,
    forecast: forecast, clampTol: clampTol, hitProb: hitProb, achievability: achievability,
    backtestYearly: backtestYearly, forecastAtOrigin: forecastAtOrigin, backtestMonthly: backtestMonthly, backtestLive: backtestLive,
    naiveBenchmarks: naiveBenchmarks, metrics: metrics, scoreForecasts: scoreForecasts, scorecardSummary: scorecardSummary,
    toUnit: toUnit, fromUnit: fromUnit, purityScale: purityScale, purityCode: purityCode, runFixtures: runFixtures
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') window.BullionEngine = API;
  else if (root) root.BullionEngine = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
