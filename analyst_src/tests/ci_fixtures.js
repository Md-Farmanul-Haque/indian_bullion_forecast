// CI gate: forecast-engine fixtures A–E. Expected values are computed here independently from the model formulas.
const path = require('path'), assert = require('assert');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));
const db = require(path.join(__dirname, '..', '..', 'data', 'research', 'chart_data.json'));
const r = E.runFixtures(db);
const near = (a, b, t, msg) => assert.ok(Math.abs(a - b) <= t, `${msg}: got ${a}, expected ${b} ±${t}`);
const expA = 145000 * 1.02 * 1.005;
for (const k of Object.keys(r.A)) near(r.A[k].base ?? r.A[k], expA, 0.01, `Fixture A base (lambda case ${k})`);
near(r.B.dln, Math.log(0.95) + Math.log(1.01) + Math.log(1.10 / 1.06), 1e-9, 'Fixture B dln');
near(r.B.base, 235000 * 0.95 * 1.01 * (1.10 / 1.06), 0.01, 'Fixture B base');
const PhC = 0.12 - 0.98 * 0.09;
near(r.C.Ph, PhC, 1e-12, 'Fixture C P_h'); near(r.C.dlnPrem, Math.log((1 + PhC) / 1.12), 1e-9, 'Fixture C dln premium');
near(r.C.base, 140240 * (1 + PhC) / 1.12, 0.01, 'Fixture C base');
near(r.C.bear, r.C.base * Math.exp(-1.28155 * r.C.sigma), 0.01, 'Fixture C bear'); near(r.C.bull, r.C.base * Math.exp(1.28155 * r.C.sigma), 0.01, 'Fixture C bull');
// Fixture D: independent SD of post-1990 INR log change from F1 rows
const rows = db.decomposition_log_points.filter(x => x.fiscal_year >= '1990-91');
const sd = a => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
near(sd(rows.map(x => x.g_world + x.g_fx + x.g_prem)), 12.33, 0.02, 'Fixture D gold SD (independent)');
near(sd(rows.map(x => x.s_world + x.s_fx + x.s_prem)), 17.72, 0.02, 'Fixture D silver SD (independent)');
near(r.D.gold_sd_total_lp ?? r.D.gold_sigma_lp, 12.33, 0.02, 'Fixture D gold SD (engine)');
near(r.D.silver_sd_total_lp ?? r.D.silver_sigma_lp, 17.72, 0.02, 'Fixture D silver SD (engine)');
assert.strictEqual(r.E.gate1W_blocked, true, 'Fixture E: 1W gate must block without anchor');
assert.ok(Math.abs(r.E.m0_skill) < 1e-12, 'Fixture E: M0 skill must be 0');
assert.strictEqual(r.E.live_weekly_status, 'NOT YET MEASURABLE', 'Fixture E: live weekly status');
assert.ok(Number.isFinite(r.E.p_tol0) && Number.isFinite(r.E.p_tol1), 'Fixture E: clamped tolerance gives finite probability');
console.log('CI fixtures A–E: PASS');
