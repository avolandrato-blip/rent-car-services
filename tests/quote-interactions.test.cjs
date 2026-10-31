const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('le bouton Devis peut résoudre une carte représentant un groupe de véhicules', () => {
  const script = read('quote-interactions.js');
  const page = read('script.js');
  assert.match(page, /onclick=\"openQuoteForVehicle\('\$\{fleetId\}'\)\"/);
  assert.match(script, /groups\.find\(item => item\?\.id === id\)/);
  assert.match(script, /selectedGroup\.vehicle \|\| selectedGroup\.units\?\.\[0\]/);
});

test('le devis public affiche un modal responsive et signale les erreurs de génération', () => {
  const script = read('quote-interactions.js');
  const page = read('index.html');
  assert.match(page, /quote-interactions\.js\?v=20261031-1/);
  assert.match(script, /public-quote-backdrop/);
  assert.match(script, /@media\(max-width:560px\)/);
  assert.match(script, /Le devis n’a pas pu être créé/);
});

test('la fenêtre imprimable est ouverte avant l’appel asynchrone au RPC', () => {
  const script = read('quote-interactions.js');
  assert.ok(script.indexOf("const printTab = window.open('', '_blank')") < script.indexOf("await window.rentCarSupabase.rpc('create_public_quote'"));
  assert.match(script, /printQuote\(\{ \.\.\.payload, reference: row\.reference, vehicle, whatsappUrl \}, printTab\)/);
});
