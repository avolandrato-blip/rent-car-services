const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

test('la table Voitures propose une action Dupliquer', () => {
  assert.match(admin, /window\.duplicateVehicle\('\$\{v\.id\}'\)/);
  assert.match(admin, />Dupliquer<\/button>/);
});

test('la duplication ouvre une nouvelle fiche sans réutiliser ID ou immatriculation', () => {
  const start = admin.indexOf('function duplicateVehicle(id)');
  const end = admin.indexOf('window.duplicateVehicle=duplicateVehicle', start);
  assert.ok(start >= 0 && end > start, 'fonction de duplication disponible globalement');
  const body = admin.slice(start, end);
  assert.match(body, /editVehicle\(id\)/);
  assert.match(body, /\$\('v-id'\)\.value=''/);
  assert.match(body, /\$\('v-registration'\)\.value=''/);
  assert.match(body, /\$\('v-status'\)\.value='available'/);
  assert.match(body, /\(copie\)/);
  assert.match(body, /vehicle-save-button/);
});

test('la fiche copiée réutilise le groupe et les données tarifaires', () => {
  assert.match(admin, /\$\('v-fleet-group'\)\.value=v\.fleet_group\|\|''/);
  for (const field of ['v-price-12h', 'v-price-24h', 'v-price-30-100', 'v-price-100-200', 'v-price-over-200', 'v-price', 'v-driver-fee', 'v-extra-driver-fee']) {
    assert.ok(admin.includes(`$('${field}').value=v.`), `valeur source préremplie : ${field}`);
  }
});
