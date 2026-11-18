const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261118130000_partner_write_guards.sql'), 'utf8');
const actions = fs.readFileSync(path.join(__dirname, '..', 'partner-actions.js'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '..', 'partner-dashboard.js'), 'utf8');

test('les écritures directes de réservations et paiements ne sont plus accordées aux partenaires', () => {
  assert.match(migration, /DROP POLICY IF EXISTS reservations_insert_scoped/);
  assert.match(migration, /reservations_insert_superadmin_only[\s\S]*?WITH CHECK \(\(SELECT public\.is_super_admin\(\)\)\)/);
  assert.match(migration, /reservations_update_superadmin_only[\s\S]*?USING \(\(SELECT public\.is_super_admin\(\)\)\)/);
  assert.match(migration, /payments_insert_superadmin_only[\s\S]*?WITH CHECK \(\(SELECT public\.is_super_admin\(\)\)\)/);
  assert.match(migration, /payments_update_superadmin_only[\s\S]*?USING \(\(SELECT public\.is_super_admin\(\)\)\)/);
});

test('les montants de réservation sont recalculés depuis le véhicule et les options côté SQL', () => {
  assert.match(migration, /partner_calculate_reservation_quote/);
  assert.match(migration, /v_rate24 := coalesce\(nullif\(v\.price_24h,0\),v_rate12\*2\)/);
  assert.match(migration, /RETURN QUERY SELECT v_days, v_rate12, v_rate24, v_rental/);
  assert.match(migration, /v_rental := v_rate24 \* ceil\(v_hours\/24\.0\)::integer/);
  assert.match(migration, /partner_create_reservation[\s\S]*?partner_calculate_reservation_quote/);
  assert.match(migration, /partner_update_reservation[\s\S]*?v_pricing_changed/);
  assert.match(actions, /total_amount:q\.total/);
  assert.match(actions, /row=reservations\.find\(item=>item\.id===id\)/);
});

test('le partenaire ne peut pas modifier directement les paiements et les fiches de retour', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.partner_add_payment/);
  assert.match(migration, /v_method NOT IN \('espece','mobile_money','virement','carte'\)/);
  assert.match(migration, /partner_save_return_form/);
  assert.match(migration, /return_forms_read_scoped[\s\S]*?FOR SELECT/);
  assert.doesNotMatch(actions, /from\('return_forms'\)\.(insert|update|upsert|delete)/);
  assert.match(actions, /partner_save_return_form/);
});

test('documents et photos restent dans des buckets privés et sont limités à la réservation gérée', () => {
  assert.match(migration, /UPDATE storage\.buckets SET file_size_limit=8388608/);
  assert.match(migration, /VALUES\('return-damage-photos','return-damage-photos',false,8388608/);
  assert.match(migration, /left\(v_photo #>> '\{\}',37\)/);
  assert.match(migration, /contract_documents_storage_partner_insert[\s\S]*?partner_can_manage_reservation/);
  assert.match(migration, /return_damage_photo_insert[\s\S]*?partner_can_manage_reservation/);
  assert.match(actions, /createSignedUrl\(button\.dataset\.viewDoc,300\)/);
});

test('la création et le déplacement d’une réservation rejettent les périodes de maintenance', () => {
  assert.match(migration, /v\.status='available'/);
  assert.match(migration, /public\.maintenance m WHERE m\.vehicle_id=v_vehicle_id AND m\.start_at<v_end AND m\.end_at>v_start/);
  assert.match(migration, /v_pricing_changed AND v_status IN \('pre_reserved','reserved'\)[\s\S]*?public\.maintenance/);
});

test('les missions chauffeur sont accessibles et attribuables sur les réservations assignées', () => {
  assert.match(migration, /partner_owns_chauffeur_mission[\s\S]*?partner_can_manage_reservation/);
  assert.match(migration, /assign_partner_chauffeur_mission[\s\S]*?partner_can_manage_reservation\(r\.id\)/);
  assert.match(actions, /assign_partner_chauffeur_mission/);
  assert.match(actions, /data-partner-booking-action|showMissions/);
  assert.match(dashboard, /data-partner-booking-action="missions"/);
});

test('l’accès OTP client est préparé dans le fragment URL et le contrôle SQL retire le droit d’écriture directe', () => {
  assert.match(actions, /link\.hash=new URLSearchParams\(\{invoice:'access'/);
  assert.match(migration, /partner_release_invoice_and_create_otp/);
  assert.match(migration, /otp_code=v_otp/);
});
