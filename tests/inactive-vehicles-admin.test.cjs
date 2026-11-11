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

test('les véhicules inactifs et terminés restent masqués du site client par la vue publique', () => {
  const migration = read('supabase/migrations/20261111160731_individual_public_fleet_uid.sql');
  assert.match(read('script.js'), /from\('public_fleet_vehicles'\)/);
  assert.match(migration, /WHERE status = 'available'/);
  assert.match(migration, /contract_end_date IS NULL OR contract_end_date >=/);
});
