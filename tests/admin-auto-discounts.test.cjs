const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function officePricing() {
  const context = {
    window: {},
    document: { getElementById: () => null, addEventListener: () => {} },
    console,
    Date,
    Math,
    Number,
    String,
    Object,
    Array,
    Set
  };
  vm.runInNewContext(read('admin-enhancements.js'), context);
  return context.window.RentCarOfficePricing;
}

function publicQuoteFunction() {
  const source = read('script.js');
  const start = source.indexOf('const distanceBandConfig =');
  const end = source.indexOf('function updateBookingQuote()', start);
  assert.ok(start >= 0 && end > start, 'calculateur public identifié');
  const controls = {
    'booking-distance-band': { value: '0_30' },
    'booking-delivery': { checked: false },
    'booking-recovery': { checked: false },
    'booking-driver': { checked: false }
  };
  const context = {
    document: { getElementById: id => controls[id] || null },
    window: {}
  };
  vm.runInNewContext(`${source.slice(start, end)}; globalThis.calculate = calculateBookingQuote;`, context);
  return context.calculate;
}

test('le calcul admin reprend le calcul client et les seuils des remises de durée', () => {
  const office = officePricing();
  const publicQuote = publicQuoteFunction();
  const vehicle = { price_12h: 100000, price_24h: 150000, price_per_day: 100000, driver_mode: 'without_driver', driver_fee: 30000 };
  const start = new Date('2026-11-01T07:00:00');

  for (const [days, expectedDiscount] of [[1, 0], [2, 0], [4, 0], [5, 15000], [9, 27000], [10, 100000]]) {
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    const admin = office.quote(vehicle, start, end, {});
    const client = publicQuote(vehicle, start.toISOString(), end.toISOString(), 'day');
    assert.equal(admin.days, days);
    assert.equal(admin.durationDiscount, expectedDiscount, `${days} jours`);
    assert.equal(admin.rental, client.rentalAmount, `parité du tarif client à ${days} jours`);
    assert.equal(admin.total, client.total, `parité du total client à ${days} jours`);
  }
});

test('la remise automatique ne s’applique pas avant les seuils et conserve les suppléments', () => {
  const office = officePricing();
  const vehicle = { price_12h: 100000, price_24h: 150000, price_per_day: 100000, driver_mode: 'without_driver', driver_fee: 30000 };
  const start = new Date('2026-11-01T07:00:00');
  const end = new Date(start.getTime() + 5 * 24 * 60 * 60 * 1000);
  const quote = office.quote(vehicle, start, end, { delivery: true, recovery: true, driver: true });
  assert.equal(quote.durationDiscount, 15000);
  assert.equal(quote.deliveryFee, 20000);
  assert.equal(quote.recoveryFee, 20000);
  assert.equal(quote.chauffeurFee, 150000);
  assert.equal(quote.total, quote.rental + quote.deliveryFee + quote.recoveryFee + quote.chauffeurFee);
});

test('un code manuel se calcule sur le total après remise automatique et reste plafonné', () => {
  const office = officePricing();
  const quote = { days: 5, total: 485000 };
  const validPromo = office.promoEligibility(quote, { code: '5JOUR', minimum_days: 5, discount_type: 'percent', discount_value: 10 });
  assert.equal(validPromo.valid, true);
  assert.equal(validPromo.discount, 48500);
  const ineligiblePromo = office.promoEligibility(quote, { code: '10JOUR', minimum_days: 10, discount_type: 'amount', discount_value: 100000 });
  assert.equal(ineligiblePromo.valid, false);
  assert.equal(ineligiblePromo.discount, 0);
  assert.equal(ineligiblePromo.message, 'Le code 10JOUR nécessite au moins 10 jours.');
  assert.equal(office.promoEligibility(quote, { code: 'FIXE', discount_type: 'amount', discount_value: 600000 }).discount, quote.total);
  assert.equal(office.promoEligibility(quote, null).discount, 0);
});

test('une période dépassant 12 h sans tarif 24 h doit être chiffrée plutôt que sous-tarifée', () => {
  const quote = officePricing().quote(
    { price_12h: 100000, price_24h: null },
    new Date('2026-11-01T07:00:00'),
    new Date('2026-11-01T20:00:00'),
    {}
  );
  assert.equal(quote.requiresQuote, true);
  assert.equal(quote.quoteReason, 'Tarif 24 heures non renseigné');
});

test('la réservation bureau persiste le palier et le tarif nécessaires au détail de remise de facture', () => {
  const source = read('admin-enhancements.js');
  assert.match(source, /daily_rate:\s*quote\.rate12[\s\S]*rate_12h:\s*quote\.rate12[\s\S]*distance_band:\s*'0_30'/);
  assert.match(source, /promo_discount:\s*discount/);
  assert.match(source, /− remise automatique de durée/);
});
