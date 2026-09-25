const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateRental } = require('../pricing-utils.js');

test('12-hour rate covers rentals up to 12 hours even without a 24-hour rate', () => {
  const quote = calculateRental(80000, null, 12);
  assert.equal(quote.requiresQuote, false);
  assert.equal(quote.rentalAmount, 80000);
  assert.equal(quote.rate24, null);
});

test('missing 24-hour rate marks durations above 12 hours as quote-only', () => {
  for (const hours of [12.01, 24, 36, 72]) {
    const quote = calculateRental(80000, '', hours);
    assert.equal(quote.requiresQuote, true, `${hours} hours`);
    assert.equal(quote.rentalAmount, null);
  }
});

test('entered 24-hour rate is used for 24, 36 and 48 hour calculations', () => {
  assert.equal(calculateRental(80000, 140000, 24).rentalAmount, 140000);
  assert.equal(calculateRental(80000, 140000, 36).rentalAmount, 220000);
  assert.equal(calculateRental(80000, 140000, 48).rentalAmount, 280000);
});

test('entered 24-hour rate drives long-rental calculations and discounts', () => {
  assert.equal(calculateRental(80000, 140000, 72).rentalAmount, 420000);
  assert.equal(calculateRental(80000, 140000, 120).rentalAmount, 679000);
});

test('a configured route rate remains calculable without a vehicle 24-hour rate', () => {
  const quote = calculateRental(80000, null, 48, 90000);
  assert.equal(quote.requiresQuote, false);
  assert.equal(quote.rentalAmount, 180000);
});

test('invalid duration and missing 12-hour rate fail closed to a quote', () => {
  assert.equal(calculateRental(0, 150000, 24).requiresQuote, true);
  assert.equal(calculateRental(80000, 150000, 0).requiresQuote, true);
});
