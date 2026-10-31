const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('le compteur des demandes en attente ouvre les réservations filtrées', () => {
  const html = read('admin.html');
  assert.match(html, /class="card metric-link" onclick="showPendingReservations\(\)"/);
  assert.match(html, /id="reservation-status-filter"/);
  assert.match(html, /filter\.value='pre_reserved'/);
  assert.match(html, /visibleReservations=reservations\.filter\(r=>statusFilter==='all'\|\|r\.status===statusFilter\)/);
});

test('la page des tarifs propose les composants de casse demandés et par véhicule', () => {
  const html = read('admin.html');
  const js = read('damage-prices.js');
  for (const component of ['Jante', 'Pneu', 'Pare-brise', 'Rayure pare-chocs avant', 'Rayure pare-chocs arrière', 'Portière', 'Bas de caisse', 'Vitre avant', 'Poignée de porte']) {
    assert.ok(js.includes(component), `Le composant ${component} est présent.`);
  }
  assert.match(html, /id="damage-price-vehicle"/);
  assert.match(html, /id="damage-price-save"/);
  assert.match(js, /from\('vehicle_damage_prices'\)/);
  assert.match(js, /vehicle_id:\s*currentVehicleId/);
  assert.match(js, /onConflict:\s*'vehicle_id,component_key'/);
});

test('la migration protège les tarifs contre les visiteurs anonymes', () => {
  const sql = read('supabase/migrations/20261031_vehicle_damage_prices.sql');
  assert.match(sql, /references public\.vehicles\(id\) on delete cascade/i);
  assert.match(sql, /unique \(vehicle_id, component_key\)/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all on public\.vehicle_damage_prices from anon, public/i);
  assert.match(sql, /to authenticated/i);
});
