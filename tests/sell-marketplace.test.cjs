const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('sell.html conserve les conditions de mise en relation commerciale et exclut celles de location', () => {
  const html = read('sell.html');
  assert.match(html, /href="#sale-terms"[^>]*>Conditions de mise en relation/);
  assert.match(html, /id="sale-terms"/);
  assert.equal((html.match(/class="flip-card sale-condition-card"/g) || []).length, 12);
  assert.doesNotMatch(html, /Nos conditions|href="index\.html#terms"/);
  assert.match(html, /data-sale-open="seller"/);
  assert.match(html, /data-sale-open="buyer"/);
});

test('sell.html reprend le mode automatique jour/nuit de la page location', () => {
  const html = read('sell.html');
  const css = read('sell-marketplace.css');
  assert.match(html, /hour >= 6 && hour < 19 \? 'premium-white' : 'royal-night'/);
  assert.match(html, /localStorage\.setItem\('rentcar-theme-mode', 'auto'\)/);
  assert.match(html, /setInterval\(applyAutoTheme, 60000\)/);
  assert.match(css, /body\[data-theme="royal-night"\] \.sale-request-modal \{ background: #122337/);
  assert.match(css, /body\[data-theme="royal-night"\] \.sale-form-grid input/);
});

test('tous les boutons sell ont le relief 3D utilisé sur la page Location', () => {
  const css = read('sell-marketplace.css');
  assert.match(css, /html\.sale-page \.btn,/);
  assert.match(css, /box-shadow: 0 4px 0 rgba\(7,22,35,\.34\)/);
  assert.match(css, /transform: translateY\(-2px\)/);
  assert.match(css, /transform: translateY\(2px\)/);
});

test('les cartes des conditions commerciales se retournent aussi au clavier', () => {
  const requests = read('sale-requests.js');
  assert.match(requests, /querySelectorAll\('\.sale-condition-card'\)/);
  assert.match(requests, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(requests, /aria-pressed/);
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
