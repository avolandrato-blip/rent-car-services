const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('les avis sont gérables dans l’administration avec photo, note et texte', () => {
  const html = read('admin.html');
  const admin = read('reviews-admin.js');
  const migration = read('20261109_site_reviews.sql');
  assert.match(html, /data-tab="reviews"/);
  assert.match(html, /id="site-review-form"/);
  assert.match(html, /id="review-photo-file"/);
  assert.match(html, /id="site-review-rating"/);
  assert.match(html, /id="site-review-text"/);
  assert.match(admin, /site_reviews/);
  assert.match(admin, /site-review-photos/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /site_reviews_public_read/);
});

test('les avis publiés défilent sur la page d’accueil et restent contrôlables', () => {
  const html = read('index.html');
  const carousel = read('reviews.js');
  assert.match(html, /id="customer-reviews"/);
  assert.match(html, /id="reviews-prev"/);
  assert.match(html, /id="reviews-next"/);
  assert.match(carousel, /setInterval/);
  assert.match(carousel, /site_reviews/);
  assert.match(carousel, /reviews-dots/);
});
