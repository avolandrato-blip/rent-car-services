const test = require('node:test');
const assert = require('node:assert/strict');
const tripRates = require('../trip-rates-utils.js');

test('adding a destination preserves every existing saved destination', () => {
  const saved = [
    { id: 'city', label: 'En ville', rate: 150000 },
    { id: 'ivato', label: 'Transfert Ivato', rate: 200000 },
  ];
  const edited = [...saved, { id: 'ampefy', label: 'Ampefy', rate: 300000 }];

  assert.deepEqual(tripRates.merge(saved, edited), [
    ...saved,
    { id: 'ampefy', label: 'Ampefy', rate: 300000 },
  ]);
});

test('routes missing from the form are retained unless explicitly removed', () => {
  const saved = [
    { id: 'city', label: 'En ville', rate: 150000 },
    { id: 'ivato', label: 'Transfert Ivato', rate: 200000 },
  ];

  assert.deepEqual(tripRates.merge(saved, [{ id: 'city', label: 'En ville', rate: 175000 }]), [
    { id: 'city', label: 'En ville', rate: 175000 },
    saved[1],
  ]);
});

test('only an explicitly removed destination is deleted', () => {
  const saved = [
    { id: 'city', label: 'En ville', rate: 150000 },
    { id: 'ivato', label: 'Transfert Ivato', rate: 200000 },
  ];

  assert.deepEqual(tripRates.merge(saved, [], ['ivato']), [saved[0]]);
});

test('legacy routes without IDs keep stable IDs and their rates', () => {
  assert.equal(tripRates.idFor({ label: 'Transfert Ivato – Tana' }), 'transfert-ivato-tana');
  assert.deepEqual(tripRates.merge(
    [{ label: 'Antananarivo → Ampefy', price_per_day: 300000 }],
    [],
  ), [{ label: 'Antananarivo → Ampefy', price_per_day: 300000, id: 'antananarivo-ampefy', rate: 300000 }]);
});

test('admin saves merged trip rates and registers only one add-destination handler', () => {
  const adminPage = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'admin.html'), 'utf8');
  const adminScript = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'morning-changes.js'), 'utf8');
  assert.match(adminPage, /trip-rates-utils\.js/);
  assert.doesNotMatch(adminPage, /\$\('add-trip-rate'\)\.addEventListener/);
  assert.match(adminScript, /trip_rates:mergedTripRates/);
  assert.match(adminScript, /select\('trip_rates'\)\.eq\('id', id\)\.single\(\)/);
  assert.match(adminScript, /removedTripRateIds\.add\(id\)/);
});
