const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const helpers = require('../partner-dashboard.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'partner.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, '..', 'partner-dashboard.js'), 'utf8');

test('la page possède un formulaire de connexion et les rubriques demandées', () => {
  assert.match(html, /id="login-form"/);
  assert.match(html, /data-tab="vehicles"/);
  assert.match(html, /data-tab="reservations"/);
  assert.match(html, /data-tab="calendar"/);
  assert.match(html, /id="metric-revenue"/);
  assert.match(html, /id="metric-unpaid"/);
});

test('un seul compte partenaire actif accède à son espace; super-admin, chauffeur et comptes expirés sont refusés', () => {
  assert.equal(helpers.canAccessPartnerPage({ role: 'partner', is_active: true, access_ends_on: '2026-11-16' }, '2026-11-16'), true);
  assert.equal(helpers.canAccessPartnerPage({ role: 'partner', is_active: true, access_ends_on: '2026-11-15' }, '2026-11-16'), false);
  assert.equal(helpers.canAccessPartnerPage({ role: 'partner', is_active: false, access_ends_on: '2026-11-30' }, '2026-11-16'), false);
  assert.equal(helpers.canAccessPartnerPage({ role: 'super_admin', is_active: true, access_ends_on: null }, '2026-11-16'), false);
  assert.equal(helpers.canAccessPartnerPage({ role: 'chauffeur', is_active: true, access_ends_on: null }, '2026-11-16'), false);
  assert.equal(helpers.canAccessPartnerPage(null, '2026-11-16'), false);
});

test('la date de fin du véhicule est J-1 de la fin d’accès, y compris au changement d’année', () => {
  assert.equal(helpers.contractEndBefore('2026-11-30'), '2026-11-29');
  assert.equal(helpers.contractEndBefore('2027-01-01'), '2026-12-31');
  assert.equal(helpers.contractEndBefore('2026-03-01'), '2026-02-28');
});

test('le paiement retenu ne double pas l’acompte lorsqu’il est déjà présent parmi les paiements', () => {
  const reservation = { id: 'r1', deposit_amount: 50000 };
  const payments = [{ reservation_id: 'r1', amount: 50000 }, { reservation_id: 'r1', amount: 20000 }, { reservation_id: 'r2', amount: 90000 }];
  assert.equal(helpers.reservationPaid(reservation, payments), 70000);
});

test('les requêtes de voitures, réservations, maintenance et paiements utilisent des limites et les données sont séparées en page dédiée', () => {
  assert.match(js, /from\('vehicles'\)\.select\([\s\S]*?\.limit\(500\)/);
  assert.match(js, /from\('reservations'\)\.select\([\s\S]*?\.limit\(1000\)/);
  assert.match(js, /from\('maintenance'\)\.select\([\s\S]*?\.limit\(500\)/);
  assert.match(js, /from\('payments'\)\.select\([\s\S]*?\.limit\(1000\)/);
  assert.match(js, /owner_user_id: state\.user\.id/);
  assert.match(js, /role === 'partner'/);
});

test('le tarif 12 h est requis et le tarif 24 h vide reste facultatif / sur devis', () => {
  assert.match(html, /id="vehicle-price-12h"[^>]*required/);
  assert.match(html, /id="vehicle-price-24h"/);
  assert.match(html, /facultatif/);
  assert.match(js, /price_24h: \$\('vehicle-price-24h'\)\.value\.trim\(\) === '' \? null/);
});

test('le dossier partenaire expose les actions opérationnelles sécurisées', () => {
  const actions = fs.readFileSync(path.join(__dirname, '..', 'partner-actions.js'), 'utf8');
  assert.match(html, /Dossier partenaire/);
  assert.match(actions, /partner_create_reservation/);
  assert.match(actions, /partner_update_reservation/);
  assert.match(actions, /partner_add_payment/);
  assert.match(actions, /partner_release_invoice_and_create_otp/);
  assert.match(actions, /assign_partner_chauffeur_mission/);
  assert.match(actions, /return_forms/);
});

test('l’espace partenaire expose les actions de réservation, calendrier et contrat', () => {
  const actions = fs.readFileSync(path.join(__dirname, '..', 'partner-actions.js'), 'utf8');
  assert.match(html, /id="partner-add-reservation"/);
  assert.match(html, /id="partner-add-block"/);
  assert.match(js, /data-partner-booking-action="accept"/);
  assert.match(js, /data-partner-booking-action="reject"/);
  assert.match(actions, /prevent_partner_vehicle_schedule_overlap|overlapQuery/);
  assert.match(actions, /Imprimer le contrat|Contrat de location de véhicule/);
  assert.match(actions, /from\('maintenance'\)\.delete\(\)/);
});
