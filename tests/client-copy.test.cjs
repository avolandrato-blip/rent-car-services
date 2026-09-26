const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('les champs requis du formulaire de contact sont explicitement déclarés', () => {
  const contact = JSON.parse(read('contact.json'));
  const fields = Object.fromEntries(contact.formulaire.map((field) => [field.id, field]));
  for (const id of ['nom', 'subject', 'message']) assert.equal(fields[id].required, true, `${id} doit être obligatoire`);
  assert.equal(fields.email.required, false, 'l’adresse e-mail reste facultative');
  const script = read('script.js');
  assert.match(script, /f\.required \? ' required' : ''/);
  assert.match(script, /<label>\$\{f\.label\}\$\{inputHtml\}<\/label>/);
});

test('les astérisques suivent les champs requis y compris ceux activés selon le parcours', () => {
  const script = read('script.js');
  const enhancement = read('enhancements.js');
  const html = read('index.html');
  const css = read('style.css');
  assert.match(script, /function syncClientRequiredMarks/);
  assert.match(script, /window\.setBookingIdentityRequired = required/);
  assert.match(script, /select\.required = rates\.length > 0/);
  assert.match(html, /class="required-fields-note"/);
  assert.match(css, /\.required-asterisk\{color:/);
  assert.match(enhancement, /paymentMethod\.required = deposit > 0/);
  assert.match(enhancement, /booking-payment-proof'\)\.required = mobile && deposit > 0/);
  assert.match(enhancement, /setBookingIdentityRequired\?\.\(!window\.bookingOwnerMode\)/);
});

test('les libellés français révisés apparaissent dans le parcours client', () => {
  const html = read('index.html');
  const script = read('script.js');
  const cards = JSON.parse(read('data_cards.json'));
  assert.match(html, /Nombre de places/);
  assert.match(html, /Adresse e-mail \(facultative\)/);
  assert.match(html, /Envoyer ma demande de réservation/);
  assert.match(script, /Aucun véhicule ne correspond à votre recherche/);
  assert.match(script, /code de vérification est incorrect/);
  assert.doesNotMatch(script, /Aucune réparation, modification ou remorquage ne peut être engagé/);
  assert.doesNotMatch(script, /La perte ou détérioration des clés/);
  assert.equal(cards.features.length, 3);
  assert.ok(cards.conditions.every((item) => item.reponse && !/Mada\.|hôtel|voitures libres/i.test(item.reponse)));
});
