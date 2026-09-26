const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const rollback = read('supabase/rollback/20260926_partner_access_rollback.sql');
const migration = read('supabase/migrations/20260926_partner_accounts_and_public_busy_slots.sql');
const admin = read('admin.html');
const accountJsExists = fs.existsSync(path.join(__dirname, '..', 'account-access.js'));
const booking = read('enhancements.js');
const publicScript = read('script.js');
const contractPackageFunction = read('supabase/functions/get-invoice-contract-package/index.ts');

test('rollback aborts instead of orphaning a partner account', () => {
  assert.match(rollback, /IF EXISTS \(SELECT 1 FROM public\.account_profiles WHERE role = 'partner'\)/);
  assert.match(rollback, /RAISE EXCEPTION 'Rollback aborted: partner profiles exist/);
});

test('rollback resets only the super-admin expiry added by this migration', () => {
  assert.match(rollback, /DROP CONSTRAINT IF EXISTS account_profiles_super_admin_expiry_required/);
  assert.match(rollback, /SET access_ends_on = NULL[\s\S]*WHERE role = 'super_admin'[\s\S]*access_ends_on = DATE '2100-12-31'/);
  assert.match(rollback, /AND p\.is_active/);
});

test('rollback restores the exact former one-day contract buffer and preserves public booking objects', () => {
  assert.match(rollback, /current_partner_access_end\(\)\) - 1/);
  assert.match(rollback, /DROP FUNCTION IF EXISTS public\.superadmin_assign_partner/);
  assert.doesNotMatch(rollback, /DROP VIEW IF EXISTS public\.public_fleet_busy_slots/);
  assert.doesNotMatch(rollback, /DROP FUNCTION.*(create_public_reservation|get_public_invoice_by_otp)/);
  assert.match(migration, /CREATE OR REPLACE VIEW public\.public_fleet_busy_slots/);
});

test('admin source is restored while public booking safeguards stay enabled', () => {
  assert.equal(accountJsExists, false);
  assert.doesNotMatch(admin, /data-superadmin-only|data-partner-hidden|account-access\.js|partner-account-form/);
  assert.match(admin, /data-tab="overview">Tableau de bord/);
  assert.match(booking, /rpc\('create_public_reservation'/);
  assert.match(publicScript, /public_fleet_busy_slots/);
  assert.match(publicScript, /functions\.invoke\('get-invoice-contract-package'/);
  assert.match(contractPackageFunction, /rest\/v1\/rpc\/get_public_invoice_by_otp/);
  assert.match(contractPackageFunction, /reservationId/);
});
