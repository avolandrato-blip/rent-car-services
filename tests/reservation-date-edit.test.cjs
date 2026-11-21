const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la RPC de modification ne cible que les réservations confirmées et conserve les gardes d’accès et de disponibilité', () => {
  const sql = read('supabase/migrations/20261121180000_update_confirmed_reservation_dates.sql');
  assert.match(sql, /SECURITY INVOKER/i);
  assert.match(sql, /status <> 'reserved'/);
  assert.match(sql, /public\.maintenance/);
  assert.match(sql, /other\.status IN \('pre_reserved'.*'reserved'/s);
  assert.match(sql, /contract_start_date/);
  assert.match(sql, /contract_end_date/);
  assert.match(sql, /SET start_at = p_start_at,[\s\S]*end_at = p_end_at,[\s\S]*days = v_days/);
  assert.match(sql, /public\.chauffeur_missions/);
  assert.doesNotMatch(sql, /SET[^;]*(?:total_amount|deposit_amount|promo_discount)/s);
  assert.match(sql, /reservations_no_vehicle_time_overlap|exclusion constraint/i);
  assert.match(sql, /FROM PUBLIC, anon/);
  assert.match(sql, /TO authenticated/);
});

test('le dialogue appelle la RPC avec les dates et explique la conservation des paiements', () => {
  const editor = read('reservation-date-editor.js');
  assert.match(editor, /update_confirmed_reservation_dates/);
  assert.match(editor, /p_start_at: startDate\.toISOString\(\)/);
  assert.match(editor, /p_end_at: endDate\.toISOString\(\)/);
  assert.match(editor, /ne seront pas recalculés automatiquement/);
  assert.match(editor, /endDate <= startDate/);
});

test('le tableau admin ajoute un bouton par période confirmée et rafraîchit après sauvegarde', () => {
  const admin = read('admin-enhancements.js');
  const page = read('admin.html');
  assert.match(page, /item\.status==='reserved'\?`<br><button type="button" class="btn outline" data-edit-reservation-dates=/);
  assert.match(page, /onclick="window\.editReservationDates\('\$\{item\.id\}'\)"/);
  assert.match(admin, /function setupReservationDateActions\(\)/);
  assert.match(admin, /row\.status !== 'reserved'/);
  assert.match(admin, /data-edit-reservation-dates/);
  assert.match(admin, /window\.editReservationDates = function \(id\)/);
  assert.match(admin, /window\.openReservationDateEditor\(reservation, \{ onSaved: \(\) => window\.refreshAll/);
});

test('le devis client affiche la durée facturée en jours pour les périodes sélectionnées', () => {
  const script = read('script.js');
  assert.match(script, /aggregate\.segments\.reduce\(\(sum, item\) => sum \+ Number\(item\.quote\.days \|\| 0\), 0\)/);
  assert.match(script, /jour\(s\)/);
});
