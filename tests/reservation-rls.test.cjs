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

test('la policy de lecture des missions partenaire évite la récursion RLS via un helper sécurisé', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '..', 'supabase/migrations/20261117221000_fix_chauffeur_mission_rls_recursion.sql'), 'utf8');
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.partner_owns_chauffeur_mission/);
  assert.match(sql, /SECURITY DEFINER[\s\S]*?SET search_path TO ''/i);
  assert.match(sql, /JOIN public\.vehicles v ON v\.id = r\.vehicle_id/);
  assert.match(sql, /v\.owner_user_id = auth\.uid\(\)/);
  const policy = sql.split('CREATE POLICY chauffeur_missions_partner_read')[1];
  assert.match(policy, /USING \(public\.partner_owns_chauffeur_mission\(reservation_id\)\)/);
  assert.doesNotMatch(policy, /FROM public\.(reservations|vehicles)/i);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.partner_owns_chauffeur_mission\(uuid\) FROM PUBLIC, anon/);
});
