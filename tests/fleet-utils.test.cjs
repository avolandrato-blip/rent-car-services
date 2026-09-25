const test = require('node:test');
const assert = require('node:assert/strict');
const { groupFleetVehicles, countAvailability } = require('../fleet-utils.js');

function unit(id, overrides = {}) {
  return {
    id,
    name: `Kia Morning ${id}`,
    make: 'Kia',
    model: 'Morning',
    transmission: 'Automatique',
    fuel: 'Essence',
    seats: 5,
    driver_mode: 'without_driver',
    price_12h: 150000,
    price_24h: 180000,
    price_per_day: 150000,
    driver_fee: 30000,
    extra_driver_fee: 30000,
    trip_rates: [],
    fleet_group: 'Kia Morning automatique',
    status: 'available',
    ...overrides,
  };
}

const start = '2026-10-01T07:00:00Z';
const end = '2026-10-02T07:00:00Z';

test('same explicit fleet label and identical terms group units without losing their identities', () => {
  const units = [unit('a'), unit('b'), unit('c')];
  const groups = groupFleetVehicles(units);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].capacity, 3);
  assert.deepEqual(groups[0].units.map(item => item.id).sort(), ['a', 'b', 'c']);
});

test('vehicles with different terms never share one public capacity count', () => {
  const groups = groupFleetVehicles([unit('a'), unit('b', { price_24h: 200000 })]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every(group => group.capacity === 1));
  assert.ok(groups.every(group => group.profileMismatch));
});

test('vehicles without a fleet label remain separate, even with the same model and prices', () => {
  const groups = groupFleetVehicles([unit('a', { fleet_group: null }), unit('b', { fleet_group: null })]);
  assert.equal(groups.length, 2);
});

test('availability counts reservations and maintenance, excluding cancelled reservations', () => {
  const group = groupFleetVehicles([unit('a'), unit('b'), unit('c')])[0];
  const reservations = [
    { vehicle_id: 'a', start_at: start, end_at: end, status: 'pre_reserved' },
    { vehicle_id: 'b', start_at: start, end_at: end, status: 'cancelled' },
  ];
  const maintenance = [{ vehicle_id: 'c', start_at: start, end_at: end }];
  const result = countAvailability(group, start, end, reservations, maintenance);
  assert.equal(result.totalCount, 3);
  assert.equal(result.availableCount, 1);
  assert.deepEqual(result.availableUnits.map(item => item.id), ['b']);
  assert.equal(result.isFull, false);
});

test('adjacent bookings do not consume the next half-open slot', () => {
  const group = groupFleetVehicles([unit('a')])[0];
  const result = countAvailability(group, end, '2026-10-03T07:00:00Z', [
    { vehicle_id: 'a', start_at: start, end_at: end, status: 'reserved' },
  ], []);
  assert.equal(result.availableCount, 1);
});

test('full fleet reports no available units', () => {
  const group = groupFleetVehicles([unit('a'), unit('b')])[0];
  const result = countAvailability(group, start, end, [
    { vehicle_id: 'a', start_at: start, end_at: end, status: 'reserved' },
    { vehicle_id: 'b', start_at: start, end_at: end, status: 'pre_reserved' },
  ], []);
  assert.equal(result.availableCount, 0);
  assert.equal(result.isFull, true);
});

test('maintenance and inactive cars remain in the fleet total but are not available', () => {
  const group = groupFleetVehicles([
    unit('a'),
    unit('b', { status: 'maintenance' }),
    unit('c', { status: 'inactive' }),
  ])[0];
  const result = countAvailability(group, start, end, [], []);
  assert.equal(result.totalCount, 3);
  assert.equal(result.availableCount, 1);
});

test('cars outside their contract dates do not count toward capacity for the requested dates', () => {
  const group = groupFleetVehicles([
    unit('a', { contract_end_date: '2026-10-01' }),
    unit('b', { contract_start_date: '2026-10-02' }),
  ])[0];
  const result = countAvailability(group, start, end, [], []);
  assert.equal(result.totalCount, 0);
  assert.equal(result.availableCount, 0);
});
