const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helpers = require('../partner-dashboard.js');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'partner.html'), 'utf8');
const loginJs = fs.readFileSync(path.join(root, 'partner-dashboard.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'partner-accounts-admin.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/manage-partner-account/index.ts'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261116183000_partner_username_login.sql'), 'utf8');
const privateCredentialsMigration = fs.readFileSync(path.join(root, 'supabase/migrations/20261117091000_partner_initial_credentials_private.sql'), 'utf8');

test('le login est basé sur le prénom comme pour le chauffeur, sans exposer l’e-mail technique', () => {
  assert.equal(helpers.normalizePartnerLogin('Tiana'), 'tiana');
  assert.equal(helpers.normalizePartnerLogin('Tíaná'), 'tiana');
  assert.equal(helpers.normalizePartnerLogin('Jean Paul'), 'jean.paul');
  assert.equal(helpers.normalizePartnerLogin('P_Tiana'), 'tiana');
  assert.equal(helpers.normalizePartnerLogin('Patrick'), 'patrick');
  assert.equal(helpers.partnerAuthEmail('Tiana'), 'tiana@partner.rent-car-service.local');
  assert.match(html, /id="login-name"/);
  assert.match(html, /placeholder="Votre prénom/);
  assert.doesNotMatch(html, /placeholder="P_Prénom"/);
  assert.doesNotMatch(html, /id="login-email"/);
});

test('le premier accès oblige à remplacer le mot de passe temporaire', () => {
  assert.match(html, /id="password-change-view"/);
  assert.match(html, /id="new-password"[^>]*minlength="12"/);
  assert.match(loginJs, /must_change_password/);
  assert.match(html, /id="temporary-password"/);
  assert.match(loginJs, /complete_first_login/);
  assert.match(loginJs, /temporary_password: temporaryPassword/);
});

test('le super-admin crée le compte depuis le prénom et la date, sans demander d’adresse e-mail', () => {
  assert.match(adminJs, /name="first_name"/);
  assert.match(adminJs, /name="access_ends_on"/);
  assert.match(adminJs, /action: 'create', first_name: firstName, access_ends_on: accessEnd/);
  assert.match(adminJs, /initial_password/);
  assert.match(adminJs, /login sera basé sur son prénom/);
  assert.match(adminJs, /mot de passe aléatoire temporaire/);
  assert.match(adminHtml, /partner-accounts-admin\.js\?v=/);
  assert.match(adminHtml, /initPartnerAccountsAdmin/);
});

test('l’Edge Function garde la création sous contrôle super-admin et crée un login unique avec mot de passe aléatoire', () => {
  assert.match(edge, /caller\.rpc\("is_super_admin"\)/);
  assert.match(edge, /const loginBase = base/);
  assert.match(edge, /replace\(\/\[\^a-z0-9\]\+\/g, "\."\)/);
  assert.match(edge, /while \(used\.has\(loginName\.toLowerCase\(\)\)\)/);
  assert.match(edge, /@partner\.rent-car-service\.local/);
  assert.match(edge, /function randomPassword\(\)/);
  assert.match(edge, /crypto\.getRandomValues/);
  assert.match(edge, /must_change_password: true/);
  assert.match(edge, /partner_initial_credentials/);
  assert.match(edge, /constantTimeEqual\(submittedHash, credential\.password_hash\)/);
  assert.doesNotMatch(edge, /P_Password/);
});

test('les politiques RLS bloquent les données tant que le nouveau mot de passe n’est pas validé', () => {
  assert.match(migration, /p\.must_change_password = false/);
  assert.match(migration, /p\.must_change_password = false/);
  assert.doesNotMatch(migration, /FUNCTION public\.complete_partner_first_login/);
  assert.match(privateCredentialsMigration, /partner_initial_credentials/);
  assert.match(privateCredentialsMigration, /REVOKE ALL ON TABLE public\.partner_initial_credentials FROM PUBLIC, anon, authenticated/);
  assert.match(privateCredentialsMigration, /DROP COLUMN IF EXISTS initial_password_hash/);
});
