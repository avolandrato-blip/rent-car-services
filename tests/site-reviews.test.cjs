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
  const privacyMigration = read('20261109_site_review_personal_details.sql');
  assert.match(html, /data-tab="reviews"/);
  assert.match(html, /id="site-review-form"/);
  assert.match(html, /id="site-reviewer-name"/);
  assert.match(html, /id="site-reviewer-gender"/);
  assert.match(html, /id="review-photo-file"/);
  assert.doesNotMatch(html, /id="review-photo-file"[^>]*required/);
  assert.match(html, /Photo miniature \(facultative\)/);
  assert.match(html, /id="site-review-rating"/);
  assert.match(html, /id="site-review-text"/);
  assert.match(admin, /site_reviews/);
  assert.match(admin, /reviewer_gender/);
  assert.match(admin, /site-review-photos/);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /site_reviews_public_read/);
  assert.match(migration, /image_url text,\s*reviewer_name/);
  assert.match(privacyMigration, /site_reviews_public/);
  const publicView = privacyMigration.split('create or replace view public.site_reviews_public')[1];
  assert.match(publicView, /reviewer_name/);
  assert.doesNotMatch(publicView, /reviewer_gender/);
});

test('les avis publiés défilent sur la page d’accueil et restent contrôlables', () => {
  const html = read('index.html');
  const carousel = read('reviews.js');
  assert.match(html, /id="customer-reviews"/);
  assert.match(html, /id="reviews-prev"/);
  assert.match(html, /id="reviews-next"/);
  assert.match(carousel, /setInterval/);
  assert.match(carousel, /5000/);
  assert.match(carousel, /site_reviews_public/);
  assert.match(carousel, /reviewer_name/);
  assert.doesNotMatch(carousel, /reviewer_gender/);
  assert.match(carousel, /reviews-dots/);
});
