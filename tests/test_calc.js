// Bill checker and what-if maths. Run: node tests/test_calc.js
const assert = require('assert');
const C = require('../assets/calc.js');
const close = (a, b, msg) => assert(Math.abs(a - b) < 0.01, `${msg}: ${a} vs ${b}`);

const rates = { g999: 134971, g916: 123633, g750: 101228, g585: 78958, s999: 170251 };
close(C.ratePerGram(rates, 'g916'), 12363.3, '22K per gram');
close(C.ratePerGram(rates, 's999'), 170.251, 'silver per gram');
close(C.ratePerGram(rates, 's925'), 170.251 * 925 / 999, 'silver 925 per gram');

// 10 g of 22K, 12% making: GST 3% on metal + making (GST Council FAQ)
let b = C.bill({ weight: 10, ratePerGram: 12363.3, making: 12, makingMode: 'pct' });
close(b.metal, 123633, 'metal');
close(b.making, 14835.96, 'making');
close(b.gst, (123633 + 14835.96) * 0.03, 'gst');
close(b.total, (123633 + 14835.96) * 1.03, 'total');

b = C.bill({ weight: 5, ratePerGram: 10000, making: 500, makingMode: 'perGram', billTotal: 56650 });
close(b.making, 2500, 'making per gram');
close(b.total, 52500 * 1.03, 'total per gram');
close(b.diff, 56650 - 54075, 'difference');
assert.strictEqual(C.bill({ weight: 0, ratePerGram: 1 }), null, 'empty weight');

// duty 15% -> 6% removes 1.15/1.06
let w = C.whatIf(115000, 0, 0, 15, 6);
close(w.price, 115000 * 1.06 / 1.15, 'duty cut');
w = C.whatIf(100000, 10, -5, 15, 15);
close(w.pct, (1.1 * 0.95 - 1) * 100, 'world and rupee');
assert.strictEqual(C.inr(123633.4), '₹1,23,633');
assert.strictEqual(C.inr(115555, { round: 100 }), '₹1,15,600');
console.log('calc tests: PASS');
