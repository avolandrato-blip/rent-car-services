const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('le devis client recalcule lors du changement de palier et utilise les jours facturés', () => {
  const script = read('script.js');
  assert.match(script, /booking-distance-band'\)\?\.addEventListener\('change', updateBookingQuote\)/);
  assert.match(script, /if \(days < band\.minDays\)/);
  assert.doesNotMatch(script, /if \(hours < band\.minHours\)/);
});

test('les durées minimales sont de 2, 3 et 4 jours pour les trois paliers éloignés', () => {
  const script = read('script.js');
  assert.match(script, /'30_100': \{[^\n]*minDays: 2/);
  assert.match(script, /'100_200': \{[^\n]*minDays: 3/);
  assert.match(script, /'over_200': \{[^\n]*minDays: 4, minHours: 96/);
  assert.match(read('20261008_distance_band_pricing.sql'), /when '100_200' then 3 else 4 end/);
  assert.match(read('20261008_distance_band_pricing.sql'), /if v_days < v_minimum_days then/);
  assert.match(read('supabase/migrations/20261009_distance_band_minimum_days.sql'), /then 3 else 4 end/);
});

test('la règle du contrat et les conditions client affichent quatre jours minimum au-delà de 200 km', () => {
  assert.match(read('contract-terms.js'), /minimumLabel: 'Minimum 4 jours'/);
  assert.match(read('data_cards.json'), /minimum 4 jours/);
  assert.doesNotMatch(read('contract-terms.js'), /Minimum 5 jours/);
  assert.doesNotMatch(read('data_cards.json'), /minimum 5 jours/);
});

test('la Hyundai i30 calcule 400 000 Ar sur deux jours facturés au palier 30–100 km', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('const distanceBandConfig =');
  const end = script.indexOf('function updateBookingQuote()', start);
  assert.ok(start >= 0 && end > start, 'configuration et moteur de devis présents');
  const controls = {
    'booking-distance-band': { value: '30_100' },
    'booking-delivery': { checked: false },
    'booking-recovery': { checked: false },
    'booking-driver': { checked: false }
  };
  const context = { document: { getElementById: id => controls[id] || null } };
  vm.runInNewContext(`${script.slice(start, end)}; globalThis.quote = calculateBookingQuote;`, context);
  const quote = context.quote(
    { price_12h: 150000, price_30_100_per_day: 200000, driver_mode: 'without_driver', driver_fee: 30000 },
    '2026-11-01T07:00',
    '2026-11-02T18:00',
    'day'
  );
  assert.equal(quote.days, 2);
  assert.equal(quote.total, 400000);
  assert.equal(quote.requiresQuote, false);
});

test('le palier >200 km calcule sur quatre jours et demande un devis en dessous du minimum', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('const distanceBandConfig =');
  const end = script.indexOf('function updateBookingQuote()', start);
  const controls = {
    'booking-distance-band': { value: 'over_200' },
    'booking-delivery': { checked: false },
    'booking-recovery': { checked: false },
    'booking-driver': { checked: false }
  };
  const context = { document: { getElementById: id => controls[id] || null } };
  vm.runInNewContext(`${script.slice(start, end)}; globalThis.quote = calculateBookingQuote;`, context);
  const vehicle = { price_over_200_per_day: 300000, driver_mode: 'without_driver' };
  const valid = context.quote(vehicle, '2026-11-01T07:00', '2026-11-05T07:00', 'day');
  assert.equal(valid.days, 4);
  assert.equal(valid.total, 1200000);
  assert.equal(valid.requiresQuote, false);
  const short = context.quote(vehicle, '2026-11-01T07:00', '2026-11-03T07:00', 'day');
  assert.equal(short.requiresQuote, true);
  assert.match(short.quoteReason, /4 jour/);
});
