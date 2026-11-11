const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('les politiques réservation utilisent un contrôle contrat sans lecture RLS récursive de vehicles', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', '20261111_fix_reservations_rls_recursion.sql'), 'utf8');
  assert.match(sql, /create or replace function public\.reservation_vehicle_contract_covers/);
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i);
  const insertPolicy = sql.split('alter policy reservations_insert_scoped')[1].split('alter policy reservations_update_scoped')[0];
  const updatePolicy = sql.split('alter policy reservations_update_scoped')[1];
  assert.match(insertPolicy, /reservation_vehicle_contract_covers\(reservations\.vehicle_id, reservations\.end_at\)/);
  assert.match(updatePolicy, /reservation_vehicle_contract_covers\(reservations\.vehicle_id, reservations\.end_at\)/);
  assert.doesNotMatch(insertPolicy, /from public\.vehicles/);
  assert.doesNotMatch(updatePolicy, /from public\.vehicles/);
});
