/* Pure calculations used by the page (and tested in tests/test_calc.js). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Calc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var GST = 0.03;

  /* Purity -> IBJA field and multiplier (IBJA publishes 999/995/916/750/585 gold and 999 silver). */
  var PURITY = {
    g999: { field: 'g999', mult: 1 }, g916: { field: 'g916', mult: 1 },
    g750: { field: 'g750', mult: 1 }, g585: { field: 'g585', mult: 1 },
    s999: { field: 's999', mult: 1 }, s925: { field: 's999', mult: 925 / 999 }
  };

  /* Rate per gram from IBJA rates (gold per 10 g, silver per kg). */
  function ratePerGram(rates, purity) {
    var p = PURITY[purity];
    if (!p || rates[p.field] == null) return null;
    var perUnit = p.field.charAt(0) === 's' ? 1000 : 10;
    return rates[p.field] / perUnit * p.mult;
  }

  /* Reference bill: GST is 3% of (metal value + making charge), per the GST Council FAQ. */
  function bill(o) {
    var w = +o.weight, rate = +o.ratePerGram;
    if (!(w > 0) || !(rate > 0)) return null;
    var metal = w * rate;
    var mk = +o.making || 0;
    var making = o.makingMode === 'perGram' ? mk * w : metal * mk / 100;
    var taxable = metal + making;
    var gst = taxable * GST;
    var total = taxable + gst;
    var out = { metal: metal, making: making, gst: gst, total: total };
    if (+o.billTotal > 0) {
      out.diff = +o.billTotal - total;
      out.diffPct = out.diff / total * 100;
    }
    return out;
  }

  /* Indian price ~ world price x rupees per dollar x (1 + import duty) (x local premium, unchanged here).
     worldPct: % change in world price; rupeePct: % change in rupees per dollar (+ = weaker rupee). */
  function whatIf(price, worldPct, rupeePct, dutyNowPct, dutyNewPct) {
    var f = (1 + worldPct / 100) * (1 + rupeePct / 100) * (1 + dutyNewPct / 100) / (1 + dutyNowPct / 100);
    return { price: price * f, pct: (f - 1) * 100 };
  }

  function inr(x, opts) {
    if (x == null || !isFinite(x)) return '–';
    var r = opts && opts.round ? Math.round(x / opts.round) * opts.round : Math.round(x);
    return '₹' + r.toLocaleString('en-IN');
  }

  return { GST: GST, PURITY: PURITY, ratePerGram: ratePerGram, bill: bill, whatIf: whatIf, inr: inr };
});
