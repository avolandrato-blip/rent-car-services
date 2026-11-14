const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('sell.html contient le menu conditions et les deux parcours modal vendeur/acheteur', () => {
  const html = read('sell.html');
  assert.match(html, /href="#sale-terms"[^>]*>Conditions de mise en relation/);
  assert.match(html, /data-sale-open="seller"/);
  assert.match(html, /data-sale-open="buyer"/);
  assert.match(html, /id="sale-terms"/);
  assert.equal((html.match(/class="flip-card sale-condition-card"/g) || []).length, 12);
  assert.match(html, /Tous les échanges, questions, visites et négociations passent par Rent Car Service/);
  assert.match(html, /Les coordonnées du vendeur et de l’acheteur ne sont pas communiquées directement/);
});

test('le modal vendeur demande les informations véhicule et ne collecte aucune photo', () => {
  const html = read('sell.html');
  const dialog = html.match(/<dialog id="sale-seller-modal"[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(dialog);
  for (const field of ['name', 'phone', 'make', 'model', 'year', 'mileage', 'condition', 'price', 'defects', 'documents', 'location']) {
    assert.match(dialog, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(dialog, /type="file"|type="checkbox"/);
  assert.match(dialog, /Aucune photo n’est demandée/);
});

test('le modal acheteur recueille marque, modèle, année, budget et nombre de places', () => {
  const html = read('sell.html');
  const dialog = html.match(/<dialog id="sale-buyer-modal"[\s\S]*?<\/dialog>/)?.[0];
  assert.ok(dialog);
  for (const field of ['name', 'phone', 'make', 'model', 'year_from', 'year_to', 'budget', 'seats', 'preferences']) {
    assert.match(dialog, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(dialog, /type="file"|type="checkbox"/);
});

test('les deux formulaires ouvrent WhatsApp de Rent Car Service, jamais un contact direct vendeur-acheteur', () => {
  const requests = read('sale-requests.js');
  const catalog = read('sale.js');
  assert.match(requests, /const whatsappNumber = '261349120726'/);
  assert.match(requests, /https:\/\/wa\.me\/\$\{whatsappNumber\}/);
  assert.match(requests, /window\.open\(url, '_blank'/);
  assert.match(requests, /ne pas communiquer directement mes coordonnées à l’acheteur/);
  assert.match(requests, /ne pas communiquer directement mes coordonnées au vendeur/);
  assert.match(requests, /new FormData\(form\)/);
  assert.match(catalog, /Demander des informations via Rent Car Service/);
  assert.match(catalog, /wa\.me\/261349120726/);
});
