/* Adapter: builds the F4 template's DATA view at runtime from the frozen SSOT_DB (F1), following F5 build_datasets.py.
 * Only SSOT_DB is embedded in the HTML; nothing here writes back into it. */
window.LEGACY_DATA_FROM_SSOT = function (db) {
  'use strict';
  var U = db.meta.source_urls;
  var TABLE = { T41: 'RBI Handbook of Statistics on Indian Economy 2009-10, Table 41', T42: 'RBI Handbook of Statistics on Indian Economy (16 Sep 2016), Table 42', T35: 'RBI Handbook of Statistics on Indian Economy 2025-26, Table 35' };
  var fs = function (fy) { return parseInt(fy.slice(0, 4), 10); };
  var rbi = function (t) { return typeof t === 'string' && t.indexOf('RBI FY') === 0; };
  var annual = db.master_yearly.filter(function (r) { return rbi(r.gold_value_type) && rbi(r.silver_value_type); }).map(function (r) {
    var code = r.source_codes.split(';')[0].trim();
    return { fy: r.fiscal_year, fy_start: fs(r.fiscal_year), gold_rs_10g: r.gold_rs_per_10g, silver_rs_kg: r.silver_rs_per_kg, london_gold_usd_oz: r.london_gold_usd_oz,
      london_gold_rs_10g: r.london_gold_rs_10g, ny_silver_cents_oz: r.ny_silver_cents_oz, ny_silver_rs_kg: r.ny_silver_rs_kg, rbi_table: TABLE[code] || code, source_url: U[code] || '' };
  });
  var fx = db.master_yearly.filter(function (r) { return r.fiscal_year < '2026'; }).map(function (r) {
    var v = r.inr_per_usd, b = r.inr_usd_basis || '';
    return { fy: r.fiscal_year, fy_start: fs(r.fiscal_year), inr_per_usd: v,
      basis: v == null ? (b.indexOf('DERIVED split') === 0 ? 'GAP (devaluation-split year: ' + b + ')' : 'GAP') : (/^(official|RBI-published)/.test(b) ? (fs(r.fiscal_year) < 1992 ? 'RBI official rate' : 'RBI-published market-based rate') : "Derived from RBI 'USD per Rs 100'") };
  });
  var macro = db.master_yearly.map(function (r) { return { fy: r.fiscal_year, wpi: r.wpi_inflation_pct, cpi_iw: r.cpi_iw_inflation_pct }; });
  var dec = db.decomposition_log_points.map(function (r) {
    return { fy: r.fiscal_year, fy_start: fs(r.fiscal_year), gold_total: r.g_total, gold_world: r.g_world, gold_rupee: r.g_fx, gold_premium: r.g_prem,
      silver_total: r.s_total, silver_world: r.s_world, silver_rupee: r.s_fx, silver_premium: r.s_prem };
  });
  var deq = db.duty_vs_premium.map(function (r) { return { fy: r.fiscal_year, gold_duty_pct: r.gold_duty_ad_valorem_equiv_pct, silver_duty_pct: r.silver_duty_ad_valorem_equiv_pct }; });
  var ev = [];
  db.master_yearly.forEach(function (r) {
    [['Geopolitical / global', 'geopolitical_events'], ['Domestic policy / internal', 'domestic_events']].forEach(function (p) {
      var t = (r[p[1]] || '').trim();
      if (t && t !== '—') ev.push({ id: r.fiscal_year + '|' + p[0].slice(0, 3), fy: r.fiscal_year, fy_start: fs(r.fiscal_year), type: p[0], text: t });
    });
  });
  // Dated pre-1970 points (incl. the 1950 and 1962 ministerial gold figures): positions as in F5 build_datasets.py
  var XDATE = [1948.625, 1950.5, 1950.75, 1951.29, 1951.46, 1955.75, 1956.75, 1957.75, 1958.25, 1958.25, 1958.36, 1958.52, 1958.52, 1958.75, null, 1959.2, 1959.25, 1959.25, 1962.5, 1962.62, 1964.45, 1964.96];
  var pts = [];
  db.pre1970_points.forEach(function (p, i) {
    var v = p.metal === 'gold' ? p.rs_per_10g : p.rs_per_kg, x = XDATE[i];
    if (v == null || v === '' || x == null) return;
    var mirror = String(p.host_flag || '').indexOf('mirror') >= 0;
    pts.push({ id: 'p' + i, date: p.date, x: x, metal: p.metal, value: +v, unit: p.metal === 'gold' ? 'Rs per 10 g' : 'Rs per kg', original: p.value_original,
      basis: p.basis + (mirror ? ' †' : ''), source: p.source + (mirror ? ' †' : ''), host: mirror ? 'RBI report read on a non-government mirror server' : 'Government host (eparlib.nic.in)', url: p.url });
  });
  var mon = db.monthly_2025_2026.filter(function (r) { return r.gold_rs_10g != null; }).map(function (r) {
    return { month: r.month, gold_rs_10g: r.gold_rs_10g, silver_rs_kg: r.silver_rs_kg, london_gold_rs_10g: r.london_gold_rs_10g, ny_silver_rs_kg: r.ny_silver_rs_kg, source: r.source };
  });
  var sgb = db.sgb_prices_rbi.map(function (r) { return { date: r.redemption_date.slice(0, 10), label: r.redemption_date, rs_per_gram: r.rs_per_gram, ibja_dates: r.ibja_dates, type: r.type, url: 'https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=' + r.prid }; });
  var duty = [];
  [['Gold', 'gold_duty_history'], ['Silver', 'silver_duty_history']].forEach(function (p) {
    db[p[1]].forEach(function (r, i) { duty.push({ id: p[0][0] + (i < 10 ? '0' : '') + i, metal: p[0], effective: r.effective, rate: r.rate, status: r.status, source: r.source }); });
  });
  var sig = function (p) { return p == null ? '' : p < 0.001 ? 'p < 0.001' : p < 0.01 ? 'p < 0.01' : p < 0.05 ? 'p < 0.05' : 'not significant (p = ' + p.toFixed(2) + ')'; };
  var corr = db.correlations.filter(function (r) { return r.pearson != null; }).map(function (r) {
    return { id: r.metal + '|' + r.vs + '|' + r.era, metal: r.metal, driver: r.vs, era: r.era, n: r.n, r: r.pearson, p: r.p, significance: sig(r.p) };
  });
  return { rbi_annual: annual, inr_usd: fx, macro: macro, decomposition: dec, duty_equiv: deq, events: ev, pre1970_points: pts, monthly: mon, sgb: sgb, duty_history: duty, correlations: corr };
};
