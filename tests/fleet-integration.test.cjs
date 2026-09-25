const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const publicScript = read('script.js');
const adminScript = read('fleet-admin.js');
const bookingScript = read('enhancements.js');
const adminPage = read('admin.html');
const migration = read('supabase/migrations/20260925_fleet_grouping_and_no_double_booking.sql');

test('public catalog reads the restricted fleet view and groups only explicit fleet labels', () => {
  assert.match(publicScript, /from\('public_fleet_vehicles'\)/);
  assert.match(publicScript, /groupFleetVehicles\(publicCars\.filter\(car => car\.status !== 'contract_ended'\)\)/);
  assert.match(publicScript, /data-fleet-id=/);
});

test('client availability summary is calculated for the selected period', () => {
  assert.match(publicScript, /countAvailability\(group, startAt, endAt, bookingReservations, bookingMaintenance\)/);
  assert.match(publicScript, /result\.availableCount/);
});

test('admin calendar aggregates both daytime and nighttime capacity per fleet', () => {
  assert.match(adminPage, /fleet-admin\.js\?v=/);
  assert.match(adminScript, /localSlot\(date, 7, 19\)/);
  assert.match(adminScript, /localSlot\(date, 19, 7, true\)/);
  assert.match(adminScript, /availableCount/);
});

test('admin vehicle form persists the shared fleet label', () => {
  assert.match(read('morning-changes.js'), /id="v-fleet-group"/);
  assert.match(read('morning-changes.js'), /fleet_group:\$\('v-fleet-group'\)/);
});

test('client reservation chooses a free physical unit and reports database conflicts', () => {
  assert.match(bookingScript, /availableUnitsForGroup\(fleetGroup/);
  assert.match(bookingScript, /vehicle_id: unit\.id/);
  assert.match(bookingScript, /attempt\.error\.code !== '23P01'/);
});

test('database migration exposes a minimal view and prevents overlapping active reservations per car', () => {
  assert.match(migration, /CREATE VIEW public\.public_fleet_vehicles/);
  assert.match(migration, /WITH \(security_invoker = false, security_barrier = true\)/);
  assert.match(migration, /REVOKE ALL ON public\.public_fleet_vehicles FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /reservations_no_vehicle_time_overlap/);
  assert.match(migration, /tstzrange\(start_at, end_at, '\[\)'\) WITH &&/);
  assert.match(migration, /status IN \('pre_reserved', 'reserved'\)/);
  assert.doesNotMatch(migration, /registration_number|owner_name/);
});
