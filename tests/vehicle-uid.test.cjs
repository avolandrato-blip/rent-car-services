const test = require('node:test');
const assert = require('node:assert/strict');
const { individualFleetVehicles, formatVehicleUid } = require('../fleet-utils.js');

test('l’UID reste stable et distingue des voitures qui ont le même nom d’affichage', () => {
  const sameName = [
    { id: 'one', uid: 31, name: 'Toyota Yaris', fleet_group: 'Toyota Yaris' },
    { id: 'two', uid: 32, name: 'Toyota Yaris', fleet_group: 'Toyota Yaris' },
  ];
  const entries = individualFleetVehicles(sameName);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].displayName, entries[1].displayName);
  assert.notEqual(formatVehicleUid(entries[0].vehicle), formatVehicleUid(entries[1].vehicle));
  assert.equal(formatVehicleUid(entries[0].vehicle), 'UID-000031');
  assert.equal(formatVehicleUid(entries[1].vehicle), 'UID-000032');
});

test('un véhicule ancien sans UID reste distinguable par son identifiant technique complet', () => {
  assert.equal(formatVehicleUid({ id: 'aabbccdd-1122-3344-5566-77889900aabb' }), 'UID-AABBCCDD11223344556677889900AABB');
});
