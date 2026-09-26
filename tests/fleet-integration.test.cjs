const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const publicScript = read('script.js');
const publicPage = read('index.html');
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

test('chauffeur destination is selected after the vehicle and before the dates', () => {
  const stepOne = publicPage.match(/<section class="booking-step active" data-booking-step="1">([\s\S]*?)<\/section>/)?.[1] || '';
  assert.ok(stepOne.indexOf('id="booking-vehicle"') < stepOne.indexOf('id="booking-trip-rate-wrap"'));
  assert.ok(stepOne.indexOf('id="booking-trip-rate-wrap"') < stepOne.indexOf('id="booking-start-date"'));
  assert.match(publicScript, /select\.required = rates\.length > 0/);
  assert.match(publicScript, /destinationInput\.value = selectedRate \? tripRateLabel\(selectedRate\)/);
  assert.ok(publicScript.includes("document.getElementById('booking-trip-rate')?.addEventListener('change', () => { syncBookingTripRates(); updateBookingQuote(); });"));
  assert.match(bookingScript, /if \(fleet\?\.vehicle\?\.driver_mode === 'with_driver' && destination && !destination\.disabled && !destination\.value\)/);
  assert.match(bookingScript, /Veuillez choisir une destination pour ce véhicule avec chauffeur avant de continuer/);
  assert.match(bookingScript, /trip_rate_label: quote\.tripRate \? tripRateLabel\(quote\.tripRate\) : null/);
});

test('chauffeur destination menu populates immediately and clears when switching vehicles', () => {
  const nodes = Object.fromEntries(['booking-vehicle','booking-trip-rate-wrap','booking-trip-rate','booking-trip-destination-wrap','booking-trip-to'].map(id => [id, {
    value: '', required: false, disabled: false, dataset: {}, innerHTML: '',
    classList: { hidden: false, toggle(_name, hidden) { this.hidden = hidden; } },
  }]));
  nodes['booking-vehicle'].value = 'fleet-with-driver';
  const groups = {
    'fleet-with-driver': { id: 'fleet-with-driver', vehicle: { driver_mode: 'with_driver', trip_rates: [{ id: 'rate-ampa', label: 'Antananarivo → Ampefy', price_per_day: 300000 }] } },
    'fleet-without-driver': { id: 'fleet-without-driver', vehicle: { driver_mode: 'self_drive', trip_rates: [] } },
  };
  const start = publicScript.indexOf('function syncBookingTripRates()');
  const end = publicScript.indexOf('\nfunction calculateBookingQuote', start);
  assert.ok(start >= 0 && end > start);
  const context = {
    document: { getElementById: id => nodes[id] || null },
    getBookingFleet: id => groups[id],
    tripRateAmount: rate => Number(rate?.price_per_day ?? rate?.rate ?? 0),
    tripRateLabel: rate => rate?.label || 'Destination spéciale',
    escapeFunHtml: value => String(value),
    formatMGA: value => `${value} Ar`,
  };
  vm.runInNewContext(publicScript.slice(start, end), context);
  context.syncBookingTripRates();
  assert.match(nodes['booking-trip-rate'].innerHTML, /Antananarivo → Ampefy — 300000 Ar \/ jour/);
  assert.equal(nodes['booking-trip-rate'].required, true);
  assert.equal(nodes['booking-trip-destination-wrap'].classList.hidden, true);
  nodes['booking-trip-rate'].value = 'rate-ampa';
  context.syncBookingTripRates();
  assert.equal(nodes['booking-trip-to'].value, 'Antananarivo → Ampefy');
  nodes['booking-vehicle'].value = 'fleet-without-driver';
  context.syncBookingTripRates();
  assert.equal(nodes['booking-trip-to'].value, '');
  assert.equal(nodes['booking-trip-rate'].required, false);
  assert.equal(nodes['booking-trip-destination-wrap'].classList.hidden, false);
});

test('public pages show availability states without exposing fleet counts', () => {
  assert.match(publicScript, /<p class="fleet-unit-count">\$\{escapeFunHtml\(state\.label\)\}<\/p>/);
  assert.doesNotMatch(publicScript, /group\.capacity\}\s*voiture/);
  assert.doesNotMatch(publicScript, /\$\{result\.availableCount\}\/\$\{result\.totalCount\}/);
  assert.doesNotMatch(publicScript, /\$\{slot\.availableUnits\.length\}\/\$\{fleetGroup\.capacity\}/);
  assert.match(publicScript, /const fleetLabel = group => group\.displayName/);
  assert.doesNotMatch(publicScript, /group\.capacity\} voiture/);
  assert.match(publicScript, /slot\.available \? 'Au moins un véhicule est disponible sur ce créneau\.'/);
  assert.match(publicScript, /available \? 'Disponible' : 'Complet'/);
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

test('client can continue after a full-slot warning when the selected period has an available car', () => {
  const assignment = 'window.clearStaleBookingAvailabilityError = clearStaleBookingAvailabilityError;';
  const start = publicScript.indexOf('function clearStaleBookingAvailabilityError()');
  const end = publicScript.indexOf(assignment, start);
  assert.ok(start >= 0 && end > start, 'stale-availability clearing helper is present');
  const result = { className: 'booking-result booking-error', textContent: 'Créneau complet : aucune voiture de cette flotte n’est disponible pour toute la période choisie. Sélectionnez d’autres dates.', classList: { contains: name => result.className.split(/\s+/).includes(name) } };
  const context = { document: { getElementById: id => id === 'booking-result' ? result : null }, window: {} };
  vm.runInNewContext(publicScript.slice(start, end + assignment.length), context);
  context.window.clearStaleBookingAvailabilityError();
  assert.equal(result.textContent, '');
  assert.equal(result.className, 'booking-result');
  result.className = 'booking-result booking-error';
  result.textContent = 'Veuillez cocher la case d’acceptation des conditions.';
  context.window.clearStaleBookingAvailabilityError();
  assert.equal(result.textContent, 'Veuillez cocher la case d’acceptation des conditions.');
  assert.match(publicScript, /if \(slot\.available\) clearStaleBookingAvailabilityError\(\)/);
  assert.match(bookingScript, /if \(slot && !slot\.available\).*Créneau complet : aucune voiture de cette flotte n’est disponible/s);
  assert.match(bookingScript, /if \(slot\?\.available\) window\.clearStaleBookingAvailabilityError\?\.\(\)/);
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
