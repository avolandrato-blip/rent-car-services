const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const generator = fs.readFileSync(path.join(root, 'reference-models.js'), 'utf8');
const adminRecovery = fs.readFileSync(path.join(root, 'admin-identity-documents.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const bookingFlow = fs.readFileSync(path.join(root, 'enhancements.js'), 'utf8');
const publicContract = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

test('admin contract stops instead of silently printing absent or unreadable identity images', () => {
  assert.match(generator, /if \(found\.error\)[\s\S]*contrat n’a pas été généré/);
  assert.match(generator, /if \(signed\.error \|\| !signed\.data\?\.signedUrl\)[\s\S]*contrat n’a pas été généré/);
  assert.match(generator, /some\(docKind => !documentImages\.some/);
  assert.match(generator, /image\.naturalWidth===0/);
  assert.doesNotMatch(generator, /Document non fourni/);
});

test('admin can upload missing private documents and only retries printing after successful upload', () => {
  assert.match(adminRecovery, /upload-identity-documents/);
  assert.match(adminRecovery, /missing\.some\(item => !uploadedKinds\.has\(item\.kind\)\)/);
  assert.match(adminRecovery, /printOriginal\(reservationId, 'contract'\)/);
  assert.match(adminRecovery, /startsWith\(`\$\{reservationId\}\/`\)/);
  assert.match(adminHtml, /reference-models\.js\?v=20260926-identity-fix/);
  assert.match(adminHtml, /admin-identity-documents\.js\?v=20260926-identity-fix/);
});

test('client reservation reports identity upload failures instead of silently resetting the form as if complete', () => {
  assert.match(bookingFlow, /identityUploadFailed/);
  assert.match(bookingFlow, /les photos d’identité n’ont pas pu être confirmées/);
  assert.match(bookingFlow, /Ne créez pas une seconde réservation/);
});

test('public contract waits for image decoding and warns instead of printing broken annex images', () => {
  assert.match(publicContract, /await Promise\.all\(\[\.\.\.document\.images\]/);
  assert.match(publicContract, /brokenImages\.length/);
  assert.match(publicContract, /n’ont pas pu être chargées/);
});
