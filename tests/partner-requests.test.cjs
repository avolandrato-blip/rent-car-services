const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('l’accueil présente B2C, P2P, B2B et deux emplacements administrables', () => {
  const html = read('index.html');
  assert.match(html, /B2C/);
  assert.match(html, /P2P/);
  assert.match(html, /B2B/);
  assert.match(html, /ads-slot-home/);
  assert.match(html, /ads-slot-fleet/);
  assert.doesNotMatch(html, /facebook.com\/share/);
});

test('les formulaires partenaires enregistrent les deux types de demandes', () => {
  const html = read('index.html');
  const js = read('partner-requests.js');
  const migration = read('20261101_partner_requests.sql');
  assert.match(html, /partner-request-form/);
  assert.match(html, /partner-make/);
  assert.match(html, /business-route/);
  assert.match(js, /partner_requests/);
  assert.match(js, /vehicle_owner/);
  assert.match(js, /business_quote/);
  assert.match(migration, /partner_requests/);
});
