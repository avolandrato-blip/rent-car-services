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
const contractTerms = require(path.join(root, 'contract-terms.js'));
const publicPage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const rentalConditions = JSON.parse(fs.readFileSync(path.join(root, 'data_cards.json'), 'utf8'));

test('contrat public imprimé inclut les articles complets et le palier kilométrique choisi', () => {
  assert.match(publicContract, /RentCarContractTerms\.buildContractTerms/);
  assert.match(publicContract, /\$\{contractArticles\}/);
  assert.match(publicContract, /Article 1 : Objet et conditions financières/);
  assert.match(publicContract, /Palier retenu/);
  assert.ok(publicPage.indexOf('contract-terms.js') < publicPage.indexOf('script.js?v='));
  assert.match(contractTerms.buildContractTerms(false, '0_30'), /Article 11 : Acceptation/);
  assert.match(contractTerms.buildContractTerms(true, 'over_200'), /Article 12 : Conditions particulières de la location avec chauffeur/);
  assert.match(contractTerms.buildContractTerms(true, '0_30'), /le locataire n’est pas autorisé à le conduire/);
});

test('article 6 encadre les frais de panne hors zone sans mentionner une panne aggravée', () => {
  const article6 = contractTerms.buildContractTerms(false, '0_30').split('<h2>Article 7 :')[0];
  assert.match(article6, /panne ou d’immobilisation survenant en dehors de la zone d’utilisation inscrite à l’article 1/);
  assert.match(article6, /après un déplacement effectué sans l’autorisation écrite préalable du loueur/);
  assert.match(article6, /frais supplémentaires liés à cette situation/);
  assert.match(article6, /ne rend pas le locataire responsable d’une panne mécanique indépendante de son comportement/);
  assert.match(article6, /sauf urgence de sécurité/);
  assert.doesNotMatch(article6, /aggrav(?:er|é|ée|ation)/i);
  assert.match(publicPage, /contract-terms\.js\?v=20261009-breakdown/);
  assert.match(adminHtml, /contract-terms\.js\?v=20261009-breakdown/);
});

test('les trois paliers fermés appliquent 1 000 Ar par km au-delà du plafond et le palier >200 km reste ouvert', () => {
  for (const [band, limit, minimum] of [['0_30', '30 km maximum', 'Formules 12 h ou 24 h'], ['30_100', '100 km maximum', 'Minimum 2 jours'], ['100_200', '200 km maximum', 'Minimum 3 jours']]) {
    const terms = contractTerms.getDistanceTerms(band);
    assert.equal(terms.limit, limit);
    assert.equal(terms.minimumLabel, minimum);
    assert.match(terms.surcharge, /1 000 Ariary par kilomètre/);
    assert.match(terms.surcharge, /trajet aller uniquement/);
  }
  const open = contractTerms.getDistanceTerms('over_200');
  assert.match(open.limit, /sans plafond supérieur/);
  assert.equal(open.minimumLabel, 'Minimum 5 jours');
  assert.doesNotMatch(open.surcharge, /1 000 Ariary par kilomètre/);
  const zoneCondition = rentalConditions.conditions.find(item => item.titre === 'Zone')?.reponse || '';
  for (const limit of ['30 km maximum', '100 km maximum', '200 km maximum', '1 000 Ar', 'sans plafond supérieur']) assert.ok(zoneCondition.includes(limit), limit);
});

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
  assert.match(generator, /RentCarContractTerms\.buildContractTerms\(withDriver, r\.distance_band\)/);
  assert.match(contractTerms.buildContractTerms(true, 'over_200'), /Conditions particulières de la location avec chauffeur/);
  assert.match(contractTerms.buildContractTerms(true, 'over_200'), /Les repas et l’hébergement du chauffeur sont à la charge du client/);
  assert.match(adminRecovery, /vehicles\(driver_mode\)/);
  assert.match(adminRecovery, /requiredDocuments\.filter\(item => item\.kind !== 'permis_recto'\)/);
  assert.match(adminHtml, /contract-terms\.js\?v=20261009-breakdown/);
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
  assert.match(adminHtml, /reference-models\.js\?v=20261009-distance-terms/);
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
