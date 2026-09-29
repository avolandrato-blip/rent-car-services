const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { groupFleetVehicles } = require('../fleet-utils.js');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function car(id, overrides = {}) {
  return { id, name: `Kia ${id}`, make: 'Kia', model: 'Morning', transmission: 'Automatique', fuel: 'Essence', seats: 5, fleet_group: 'Kia Morning', status: 'available', price_12h: 150000, price_24h: null, price_per_day: 150000, ...overrides };
}

test('un groupe accepte des prix différents et choisit le moins cher à afficher', () => {
  const group = groupFleetVehicles([car('cher', { price_per_day: 180000 }), car('moins-cher', { price_per_day: 120000 })])[0];
  assert.equal(group.capacity, 2);
  assert.equal(group.vehicle.id, 'moins-cher');
  assert.deepEqual(group.units.map(v => v.id), ['moins-cher', 'cher']);
});

test('le catalogue affiche Sur devis sans tarif 24 h', () => {
  const script = read('script.js');
  assert.match(script, /full_day:car\.price_24h \? formatMGA\(car\.price_24h\) : 'Sur devis'/);
  assert.match(script, /requiresQuote = !hasRate24 && billedHours > 12/);
});

test('la plaque et le prix 24 h sont facultatifs dans l’admin', () => {
  const admin = read('admin.html');
  assert.match(admin, /Numéro d’immatriculation \(facultatif\)/);
  assert.doesNotMatch(admin, /id="v-registration" required/);
  assert.match(admin, /Prix 24 h \(Ar\) — facultatif/);
  assert.match(admin, /price_24h:\$\('v-price-24h'\)\.value\.trim\(\)===''\?null/);
});

test('l’admin propose la création visuelle d’un groupe', () => {
  assert.match(read('admin.html'), /id="create-fleet-group"/);
  assert.match(read('morning-changes.js'), /function openFleetGroupForm/);
  assert.match(read('morning-changes.js'), /update\(\{fleet_group:name\}\)/);
});
