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
const publicContractFunction = fs.readFileSync(path.join(root, 'supabase/functions/get-invoice-contract-package/index.ts'), 'utf8');

test('admin contract stops instead of silently printing absent or unreadable identity images', () => {
  assert.match(generator, /if \(found\.error\)[\s\S]*contrat n’a pas été généré/);
  assert.match(generator, /if \(signed\.error \|\| !signed\.data\?\.signedUrl\)[\s\S]*contrat n’a pas été généré/);
  assert.match(generator, /some\(docKind => !documentImages\.some/);
  assert.match(generator, /image\.naturalWidth===0/);
  assert.doesNotMatch(generator, /Document non fourni/);
});

test('contrat chauffeur admin accepte CIN recto-verso sans exiger ou afficher le permis', () => {
  assert.match(generator, /requiredIdentityKinds = withDriver \? \['cin_recto','cin_verso'\]/);
  assert.match(generator, /const licenseDetails = withDriver \? ''/);
  assert.match(generator, /Conditions de la location avec chauffeur/);
  assert.match(generator, /Les repas et l’hébergement du chauffeur sont à la charge du client/);
  assert.match(adminRecovery, /vehicles\(driver_mode\)/);
  assert.match(adminRecovery, /requiredDocuments\.filter\(item => item\.kind !== 'permis_recto'\)/);
});

test('la fonction OTP ne signe pas les pièces de permis pour les contrats avec chauffeur', () => {
  assert.match(publicContractFunction, /const withDriver = Boolean\(invoice\?\.reservation\?\.with_driver \|\| invoice\?\.vehicle\?\.driver_mode === "with_driver"\)/);
  assert.match(publicContractFunction, /const documentKinds = withDriver \? \["cin_recto", "cin_verso"\]/);
  assert.match(publicContractFunction, /document_kind: `in\.\(\$\{documentKinds\.join\(","\)\}\)`/);
  assert.match(publicContractFunction, /for \(const kind of documentKinds\)/);
});

test('admin can upload missing private documents and only retries printing after successful upload', () => {
  assert.match(adminRecovery, /upload-identity-documents/);
  assert.match(adminRecovery, /missing\.some\(item => !uploadedKinds\.has\(item\.kind\)\)/);
  assert.match(adminRecovery, /printOriginal\(reservationId, 'contract'\)/);
  assert.match(adminRecovery, /startsWith\(`\$\{reservationId\}\/`\)/);
  assert.match(adminHtml, /reference-models\.js\?v=20260927-driver-license-rules/);
  assert.match(adminHtml, /admin-identity-documents\.js\?v=20260927-driver-license-rules/);
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
