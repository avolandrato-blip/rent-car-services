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

test('le choix d’une voiture affiche les quatre tarifs et met en évidence le palier retenu', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('const distanceBandConfig =');
  const end = script.indexOf('function updateBookingQuote()', start);
  const panel = { hidden: false, innerHTML: '' };
  const options = ['0_30', '30_100', '100_200', 'over_200'].map(value => ({ value, textContent: '' }));
  const controls = {
    'booking-distance-band': { value: '30_100', options },
    'booking-distance-prices': panel
  };
  const context = {
    document: { getElementById: id => controls[id] || null },
    escapeFunHtml: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  };
  vm.runInNewContext(`${script.slice(start, end)}; globalThis.renderPrices = renderBookingDistancePrices;`, context);
  context.renderPrices({
    name: 'Hyundai i30',
    price_per_day: 150000,
    price_12h: 150000,
    price_24h: 180000,
    price_30_100_per_day: 200000,
    price_100_200_per_day: 250000,
    price_over_200_per_day: 300000
  });
  assert.equal(panel.hidden, false);
  for (const price of ['150.000 Ar/jour', '180.000 Ar', '200.000 Ar/jour', '250.000 Ar/jour', '300.000 Ar/jour']) assert.ok(panel.innerHTML.includes(price), price);
  assert.match(panel.innerHTML, /30–100 km/);
  assert.match(panel.innerHTML, /Palier choisi/);
  assert.match(panel.innerHTML, /Minimum 2 jours/);
  assert.deepEqual(options.map(option => option.textContent), [
    '0–30 km — 150.000 Ar/jour',
    '30–100 km — 200.000 Ar/jour · min. 2 j',
    '100–200 km — 250.000 Ar/jour · min. 3 j',
    '>200 km — 300.000 Ar/jour · min. 4 j'
  ]);
  assert.ok(options.every(option => !option.textContent.includes('1 000 Ar/km')));
  const publicPage = read('index.html');
  const bandSelect = publicPage.match(/<select id="booking-distance-band"[\s\S]*?<\/select>/)?.[0] || '';
  assert.ok(bandSelect);
  assert.doesNotMatch(bandSelect, /1 000 Ar\/km/);
});
