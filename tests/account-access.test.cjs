const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const migration = read('supabase/migrations/20260926_partner_accounts_and_public_busy_slots.sql');
const access = read('account-access.js');
const admin = read('admin.html');
const booking = read('enhancements.js');
const publicScript = read('script.js');
const vehicleAdmin = read('morning-changes.js');

test('admin login checks for an active, unexpired profile before opening the application', () => {
  assert.match(admin, /window\.loadAccountAccess\?\.\(\)/);
  assert.match(access, /await db\.auth\.getUser\(\)/);
  assert.match(access, /profile\.is_active/);
  assert.match(access, /profile\.access_ends_on >= madagascarToday\(\)/);
  assert.match(access, /await db\.auth\.signOut\(\)/);
});

test('partner interface exposes only reservations, vehicles and maintenance tabs', () => {
  for (const label of ['Tableau de bord', 'Réservation bureau', 'Clients', 'Codes promo', 'Divertissement']) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(admin, new RegExp(`<button[^>]*data-partner-hidden[^>]*>${escaped}<\\/button>`));
  }
  assert.match(access, /profile\.role === 'super_admin'/);
  assert.match(admin, /data-superadmin-only/);
});

test('only a super-admin can associate an already-existing auth account as partner', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.superadmin_assign_partner/);
  assert.match(migration, /SECURITY DEFINER/);
  assert.match(migration, /IF NOT public\.is_super_admin\(\) THEN/);
  assert.match(migration, /FROM auth\.users AS u/);
  assert.match(migration, /An existing super-admin cannot be changed to partner/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.superadmin_assign_partner[\s\S]*FROM PUBLIC, anon/);
  assert.match(migration, /p_access_ends_on < \(now\(\) AT TIME ZONE 'Indian\/Antananarivo'\)::date/);
  assert.match(migration, /UPDATE public\.account_profiles[\s\S]*access_ends_on = DATE '2100-12-31'[\s\S]*WHERE role = 'super_admin'/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_super_admin\(\)[\s\S]*access_ends_on >= \(now\(\) AT TIME ZONE 'Indian\/Antananarivo'\)::date/);
  assert.match(migration, /account_profiles_super_admin_expiry_required[\s\S]*role <> 'super_admin' OR access_ends_on IS NOT NULL/);
  assert.match(access, /rpc\('superadmin_assign_partner'/);
});

test('partner vehicle creation records the authenticated owner and respects the inclusive access-end date', () => {
  assert.match(vehicleAdmin, /if \(!id && window\.currentAccountProfile\?\.role === 'partner'\) payload\.owner_user_id = window\.currentAccountUserId/);
  assert.match(migration, /contract_end_date <= \(SELECT public\.current_partner_access_end\(\)\)/);
  assert.match(migration, /CREATE POLICY vehicles_insert_scoped[\s\S]*owner_user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(migration, /CREATE POLICY vehicles_update_scoped[\s\S]*owner_user_id = \(SELECT auth\.uid\(\)\)/);
});

test('public availability reveals only busy periods and never customer or financial data', () => {
  const view = migration.slice(migration.indexOf('CREATE OR REPLACE VIEW public.public_fleet_busy_slots'));
  assert.match(view, /vehicle_id[\s\S]*start_at[\s\S]*end_at[\s\S]*slot_type/);
  assert.doesNotMatch(view, /customer_|phone|email|payment|amount|otp|notes/i);
  assert.match(migration, /GRANT SELECT ON public\.public_fleet_busy_slots TO anon, authenticated/);
  assert.match(publicScript, /from\('public_fleet_busy_slots'\)/);
});

test('public booking and invoice lookup use rate-checked, server-side RPCs', () => {
  assert.match(booking, /rpc\('create_public_reservation'/);
  assert.doesNotMatch(booking, /from\('reservations'\)\.insert/);
  assert.doesNotMatch(booking, /from\('customers'\)\.insert/);
  assert.match(publicScript, /rpc\('create_public_reservation'/);
  assert.match(publicScript, /rpc\('get_public_invoice_by_otp'/);
  assert.doesNotMatch(publicScript, /from\('reservations'\)\.insert/);
  assert.doesNotMatch(publicScript, /from\('reservations'\)\.select\('\*'/);
});
