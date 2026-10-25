const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const terms = require(path.join(root, 'contract-terms.js'));
const publicGenerator = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const adminGenerator = fs.readFileSync(path.join(root, 'reference-models.js'), 'utf8');

test('le contrat sans chauffeur est subdivisé et conserve les règles de remboursement convenues', () => {
  const html = terms.buildContractTerms(false, '0_30');
  for (const subarticle of ['2.1 Âge et permis', '3.1 Palier et distance', '4.1 Prêt et transfert', '6.4 Panne hors zone autorisée', '9.3 Usage commercial interdit et autres manquements', '11.1 Acceptation']) {
    assert.ok(html.includes(subarticle), `sous-article absent : ${subarticle}`);
  }
  assert.match(html, /taxi ou pour le transport via InDrive, Rapid App ou toute application similaire/);
  assert.match(html, /surfacturation de 100 000 Ariary par jour de location consommé/);
  assert.match(html, /reprendre immédiatement le véhicule conformément à l’article 8/);
  assert.match(html, /Les jours restants déjà payés sont remboursés à 50 % uniquement/);
  assert.match(html, /Pour tout autre manquement[\s\S]*aucun remboursement des jours restants n’est dû/);
});

test('le contrat avec chauffeur conserve son contenu distinct sans la clause d’usage commercial', () => {
  const html = terms.buildContractTerms(true, '0_30');
  assert.match(html, /Article 12 : Conditions particulières de la location avec chauffeur/);
  assert.match(html, /le locataire n’est pas autorisé à le conduire/);
  assert.doesNotMatch(html, /9\.3 Usage commercial|100 000 Ariary par jour de location consommé/);
});

test('les générateurs public et admin appliquent deux colonnes A4 uniquement au contrat sans chauffeur', () => {
  assert.match(publicGenerator, /contract-page \$\{data\.with_driver \? 'with-driver' : 'without-driver'\}/);
  assert.match(publicGenerator, /contract-page\.without-driver\{font:10pt\/1\.14 Arial/);
  assert.match(publicGenerator, /contract-page\.without-driver \.contract-content\{column-count:2/);
  assert.match(publicGenerator, /contract-page\.without-driver \.grid\{display:block/);
  assert.match(adminGenerator, /contract-document \$\{isInvoice \? 'invoice-document' : \(withDriver \? 'with-driver' : 'without-driver'\)\}/);
  assert.match(adminGenerator, /contract-document\.without-driver\{font:10pt\/1\.14 Arial/);
  assert.match(adminGenerator, /contract-document\.without-driver \.contract-content\{column-count:2/);
  assert.match(adminGenerator, /contract-document\.without-driver \.grid\{display:block/);
});
