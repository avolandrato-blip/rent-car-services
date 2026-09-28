const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'chauffeurs.js'), 'utf8');
test('la fiche chauffeur permet d’ouvrir la caméra', () => {
  assert.match(admin, /id="driver-photo-file"[^>]*capture="environment"/);
  assert.match(admin, /id="driver-photo-preview"/);
});
test('la photo chauffeur est téléversée dans Supabase Storage et publiée', () => {
  assert.match(js, /storage\.from\(PHOTO_BUCKET\)\.upload/);
  assert.match(js, /getPublicUrl\(path\)/);
  assert.match(js, /photo_url:photoUrl/);
});
