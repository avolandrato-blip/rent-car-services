const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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
  assert.match(admin, /window\.vehicleDuplicationSource=v/);
  assert.match(admin, /owner_user_id:source\.owner_user_id/);
  assert.match(admin, /contract_end_date:source\.contract_end_date/);
  assert.match(admin, /uniqueVehicleSlug\(name,id\)/);
});

test('la fiche copiée réutilise le groupe et les données tarifaires', () => {
  assert.match(admin, /\$\('v-fleet-group'\)\.value=v\.fleet_group\|\|''/);
  for (const field of ['v-price-12h', 'v-price-24h', 'v-price-30-100', 'v-price-100-200', 'v-price-over-200', 'v-price', 'v-driver-fee', 'v-extra-driver-fee']) {
    assert.ok(admin.includes(`$('${field}').value=v.`), `valeur source préremplie : ${field}`);
  }
});

test('le même nom affiché reçoit un slug distinct pour chaque nouveau véhicule', () => {
  const start = admin.indexOf('function uniqueVehicleSlug(');
  const end = admin.indexOf('async function uploadVehiclePhotos', start);
  assert.ok(start >= 0 && end > start, 'générateur de slug disponible');
  const uuids = ['11111111111141118111111111111111', '22222222222242228222222222222222'];
  const context = {
    vehicles: [{ id: 'existing', name: 'Getz Manuelle', slug: 'getz-manuelle' }],
    crypto: { randomUUID: () => uuids.shift() },
  };
  const generateSlug = vm.runInNewContext(`${admin.slice(start, end)}; uniqueVehicleSlug`, context);
  const first = generateSlug('Getz Manuelle', '');
  const second = generateSlug('Getz Manuelle', '');
  assert.equal(first, 'getz-manuelle-11111111111141118111111111111111');
  assert.equal(second, 'getz-manuelle-22222222222242228222222222222222');
  assert.notEqual(first, second);
  assert.match(admin, /Le nom affiché peut être identique à celui d’une autre voiture/);
});

test('la modification d’une voiture, y compris un renommage de casse, conserve le slug stable', () => {
  const start = admin.indexOf('function uniqueVehicleSlug(');
  const end = admin.indexOf('async function uploadVehiclePhotos', start);
  const context = { vehicles: [{ id: 'car-1', name: 'Getz Manuelle', slug: 'getz-manuelle-ancien' }], crypto: { randomUUID: () => 'unused' } };
  const generateSlug = vm.runInNewContext(`${admin.slice(start, end)}; uniqueVehicleSlug`, context);
  assert.equal(generateSlug('Getz Manuelle', 'car-1'), 'getz-manuelle-ancien');
  assert.equal(generateSlug('GETZ', 'car-1'), 'getz-manuelle-ancien');
});
