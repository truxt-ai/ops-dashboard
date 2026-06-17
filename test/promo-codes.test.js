'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { promoCatalog, getActivePromoCodes, applyPromoCode } = require('../src/lib/promo-codes');

// --- Catalog shape (SD-4, FR-4 analog for promo domain) ---

test('promoCatalog contains exactly three entries', () => {
  assert.strictEqual(promoCatalog.length, 3);
});

test('promoCatalog: WELCOME10 is active at 10%', () => {
  const entry = promoCatalog.find(c => c.code === 'WELCOME10');
  assert.ok(entry, 'WELCOME10 missing from catalog');
  assert.strictEqual(entry.percent, 10);
  assert.strictEqual(entry.active, true);
});

test('promoCatalog: PRO25 is active at 25%', () => {
  const entry = promoCatalog.find(c => c.code === 'PRO25');
  assert.ok(entry, 'PRO25 missing from catalog');
  assert.strictEqual(entry.percent, 25);
  assert.strictEqual(entry.active, true);
});

test('promoCatalog: LEGACY50 is present but inactive at 50%', () => {
  const entry = promoCatalog.find(c => c.code === 'LEGACY50');
  assert.ok(entry, 'LEGACY50 missing from catalog');
  assert.strictEqual(entry.percent, 50);
  assert.strictEqual(entry.active, false);
});

// --- List endpoint helper: getActivePromoCodes() ---
// Covers acceptance criterion 1 and DF-3 for the promo domain.

test('getActivePromoCodes returns exactly WELCOME10 and PRO25', () => {
  const active = getActivePromoCodes();
  assert.strictEqual(active.length, 2);
  const codes = active.map(c => c.code).sort();
  assert.deepStrictEqual(codes, ['PRO25', 'WELCOME10']);
});

test('getActivePromoCodes excludes LEGACY50', () => {
  const active = getActivePromoCodes();
  assert.ok(!active.some(c => c.code === 'LEGACY50'), 'LEGACY50 must not appear in active list');
});

test('getActivePromoCodes returns only active entries', () => {
  const active = getActivePromoCodes();
  for (const entry of active) {
    assert.strictEqual(entry.active, true, `inactive code ${entry.code} returned by getActivePromoCodes`);
  }
});

// --- Apply logic: applyPromoCode(code, price) ---
// Table-driven; covers acceptance criteria 2-5.

const applyTable = [
  // [label, code, price, expected]
  ['WELCOME10 on 100 → 90 (10% off)',          'WELCOME10', 100,   90   ],
  ['PRO25 on 100 → 75 (25% off)',              'PRO25',    100,   75   ],
  ['LEGACY50 on 100 → 100 (inactive, no change)', 'LEGACY50', 100, 100  ],
  ['unknown code on 100 → 100 (unchanged)',    'NOPE',     100,  100   ],
  ['misspelled code on 100 → 100 (unchanged)', 'WELCOME',  100,  100   ],
  ['empty string code on 100 → 100 (unchanged)', '',       100,  100   ],
  ['PRO25 on 99.99 rounds to 74.99',           'PRO25',    99.99, 74.99],
  ['WELCOME10 on 0 → 0 (never negative)',      'WELCOME10',  0,    0   ],
  ['WELCOME10 on 0.05 rounds to nearest cent', 'WELCOME10', 0.05, 0.05],
];

for (const [label, code, price, expected] of applyTable) {
  test(`applyPromoCode: ${label}`, () => {
    assert.strictEqual(applyPromoCode(code, price), expected);
  });
}
