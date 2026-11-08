const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('le tableau de bord contient une page de gestion des propriétaires et de leurs voitures', () => {
  const admin = read('admin.html');
  const script = read('owners-admin.js');
  assert.match(admin, /data-tab="owners">Propriétaires \/ prestataires/);
  assert.match(admin, /<section id="owners" class="tab">/);
  for (const id of ['owner-assignment-form', 'owner-name', 'owner-first-name', 'owner-phone', 'owner-address', 'owner-nif', 'owner-stat', 'owner-whatsapp-enabled', 'owner-vehicles', 'owner-unassign', 'owners-table']) {
    assert.match(admin, new RegExp(`id="${id}"`));
  }
  assert.match(admin, /owners-admin\.js\?v=/);
  assert.match(script, /owner_name: lastName/);
  assert.match(script, /owner_phone: phone/);
  assert.match(script, /owner_whatsapp_enabled: \$\('owner-whatsapp-enabled'\)\.checked/);
  assert.match(script, /\.in\('id', selectedIds\)/);
});

test('la réservation publique charge les coordonnées du propriétaire et privilégie son WhatsApp s’il est activé', () => {
  const client = read('script.js');
  const booking = read('enhancements.js');
  const matches = client.match(/from\('public_fleet_vehicles'\)\.select\('[^']*owner_phone,owner_whatsapp_enabled/g) || [];
  assert.equal(matches.length, 2, 'les deux requêtes de flotte chargent le numéro et le réglage WhatsApp');
  assert.match(booking, /const routeToOwner = Boolean\(ownerRecipient && \(ownerMode \|\| reservedUnit\.owner_whatsapp_enabled\)\)/);
  assert.match(booking, /const recipient = routeToOwner \? ownerRecipient : normalizeWhatsAppNumber\(siteConfig\.footer\.whatsapp\)/);
  assert.match(booking, /Merci de confirmer la disponibilité de cette voiture/);
});

test('les numéros locaux malgaches sont convertis au format international avant l’ouverture de WhatsApp', () => {
  const booking = read('enhancements.js');
  assert.match(booking, /if \(digits\.startsWith\('0'\)\) digits = `261\$\{digits\.slice\(1\)\}`/);
  assert.match(booking, /window\.open\(`https:\/\/wa\.me\/\$\{recipient\}\?text=\$\{message\}`/);
});
