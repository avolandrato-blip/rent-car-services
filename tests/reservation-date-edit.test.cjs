const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const dateEditMigration = 'supabase/migrations/20261121183500_allow_completed_reservation_date_edits.sql';

test('la RPC autorise les réservations confirmées et terminées tout en conservant les gardes d’accès et de disponibilité', () => {
  const sql = read(dateEditMigration);
  assert.match(sql, /SECURITY INVOKER/i);
  assert.match(sql, /v_reservation\.status NOT IN \('reserved'::public\.reservation_status,\s*'completed'::public\.reservation_status\)/);
  assert.doesNotMatch(sql, /status <> 'reserved'/);
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
  assert.match(editor, /!\['reserved', 'completed'\]\.includes\(reservation\.status\)/);
  assert.match(editor, /confirmées ou terminées peuvent être modifiées/);
  assert.match(read('admin-enhancements.js'), /reservation-date-editor\.js\?v=20261121-completed-dates/);
});

test('le tableau admin ajoute un bouton pour les périodes confirmées et terminées, puis rafraîchit après sauvegarde', () => {
  const admin = read('admin-enhancements.js');
  const page = read('admin.html');
  assert.match(page, /\(item\.status==='reserved'\|\|item\.status==='completed'\)\?`<br><button type="button" class="btn outline" data-edit-reservation-dates=/);
  assert.match(page, /onclick="window\.editReservationDates\('\$\{item\.id\}'\)"/);
  assert.match(admin, /function setupReservationDateActions\(\)/);
  assert.match(admin, /!\['reserved', 'completed'\]\.includes\(row\.status\)/);
  assert.match(admin, /data-edit-reservation-dates/);
  assert.match(admin, /window\.editReservationDates = function \(id\)/);
  assert.match(admin, /window\.openReservationDateEditor\(reservation, \{ onSaved: \(\) => window\.refreshAll/);
});

test('le devis client affiche la durée facturée en jours pour les périodes sélectionnées', () => {
  const script = read('script.js');
  assert.match(script, /aggregate\.segments\.reduce\(\(sum, item\) => sum \+ Number\(item\.quote\.days \|\| 0\), 0\)/);
  assert.match(script, /jour\(s\)/);
});
