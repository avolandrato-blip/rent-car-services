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

test('les publicités restent sur leurs emplacements dédiés et l’accueil affiche les avis', () => {
  const script = read('script.js');
  const html = read('index.html');
  const reviews = read('reviews.js');
  assert.match(script, /site_ads/);
  assert.match(script, /description/);
  assert.match(script, /cta_label/);
  assert.match(script, /ad-slot-copy/);
  assert.match(script, /starts_at/);
  assert.match(script, /ends_at/);
  assert.doesNotMatch(script, /ads-slot-home/);
  assert.match(script, /ads-slot-fleet/);
  assert.match(script, /ads-slot-booking/);
  assert.match(script, /placement/);
  assert.doesNotMatch(html, /id="ads-slot-home"/);
  assert.match(html, /id="customer-reviews"/);
  assert.match(reviews, /site_reviews/);
  assert.match(html, /id="ads-slot-fleet"/);
  assert.match(html, /id="ads-slot-booking"/);
  assert.doesNotMatch(html, /facebook-ad-card|PUBLICITÉ FACEBOOK/);
});

test('admin permet de gérer une publicité avec image, lien et date de fin', () => {
  const html = read('admin.html');
  const admin = read('admin-enhancements.js');
  assert.match(html, /data-tab="ads"/);
  assert.match(html, /id="ads-form"/);
  assert.match(html, /id="ad-image-file"/);
  assert.match(html, /id="ad-ends-at"/);
  assert.match(html, /id="ad-placement"/);
  assert.match(html, /value="home" disabled/);
  assert.match(html, /id="ad-description"/);
  assert.match(html, /id="ad-cta-label"/);
  assert.match(html, /value="booking"/);
  assert.match(admin, /site_ads/);
  assert.match(admin, /site-ads/);
  assert.match(admin, /\['fleet','booking'\]/);
  assert.match(admin, /description/);
  assert.match(admin, /cta_label/);
  assert.match(admin, /ends_at/);
});

test('le modal partenaire adopte une présentation marketing', () => {
  const html = read('index.html');
  const css = read('client-harmony.css');
  const js = read('partner-requests.js');
  assert.match(html, /partner-modal-eyebrow/);
  assert.match(html, /partner-modal-subtitle/);
  assert.match(html, /partner-trust-strip/);
  assert.match(css, /partner-modal-header/);
  assert.match(css, /backdrop-filter/);
  assert.match(js, /Construisons votre offre entreprise/);
});
