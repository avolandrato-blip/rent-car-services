const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('le footer client utilise les liens sociaux administrables', () => {
  const script = read('script.js');
  const admin = read('admin-enhancements.js');
  assert.match(script, /siteConfig\.social_links/);
  assert.match(script, /facebook/);
  assert.match(script, /tiktok/);
  assert.match(script, /maps/);
  assert.match(admin, /settings-facebook/);
  assert.match(admin, /settings-tiktok/);
  assert.match(admin, /settings-maps/);
});

test('les publicités sont chargées selon leur période et affichées sur l’accueil', () => {
  const script = read('script.js');
  const html = read('index.html');
  assert.match(script, /site_ads/);
  assert.match(script, /starts_at/);
  assert.match(script, /ends_at/);
  assert.match(script, /ads-slot/);
  assert.match(html, /id="ads-slot"/);
});

test('admin permet de gérer une publicité avec image, lien et date de fin', () => {
  const html = read('admin.html');
  const admin = read('admin-enhancements.js');
  assert.match(html, /data-tab="ads"/);
  assert.match(html, /id="ads-form"/);
  assert.match(html, /id="ad-image-file"/);
  assert.match(html, /id="ad-ends-at"/);
  assert.match(admin, /site_ads/);
  assert.match(admin, /site-ads/);
  assert.match(admin, /ends_at/);
});
