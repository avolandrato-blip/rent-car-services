const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('les véhicules inactifs restent consultables dans l’administration', () => {
  const admin = read('admin.html');
  assert.match(admin, /id="vehicle-status-filter"/);
  assert.match(admin, /value="inactive">Inactifs/);
  assert.match(admin, /visibleVehicles\.map\(v=>/);
  assert.match(admin, /setVehicleStatus/);
});

test('les véhicules inactifs restent masqués du site client', () => {
  const script = read('script.js');
  assert.match(script, /from\('vehicles'\)/);
  assert.match(script, /\.neq\('status','inactive'\)/);
  assert.match(script, /\.neq\('status','contract_ended'\)/);
});
