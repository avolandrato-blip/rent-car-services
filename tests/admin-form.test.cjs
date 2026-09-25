const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const adminLogic = fs.readFileSync(path.join(root, 'morning-changes.js'), 'utf8');
const publicLogic = fs.readFileSync(path.join(root, 'script.js'), 'utf8');

function inputMarkup(id) {
  const pattern = new RegExp(`<input\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>`, 'i');
  return adminHtml.match(pattern)?.[0] || '';
}

test('12-hour price remains mandatory', () => {
  assert.match(inputMarkup('v-price-12h'), /\brequired\b/);
});

test('24-hour price is optional and blank means quote-only', () => {
  const markup = inputMarkup('v-price-24h');
  assert.ok(markup, '24-hour price input exists');
  assert.doesNotMatch(markup, /\brequired\b/);
  assert.match(adminHtml, /Prix 24 h \(Ar\) — facultatif \(vide = sur devis\)/);
  assert.match(adminLogic, /price24Input\s*===\s*''\s*\?\s*null/);
  assert.match(adminHtml, /price_24h:\$\('v-price-24h'\)\.value\.trim\(\)===''\?null:Number\(\$\('v-price-24h'\)\.value\)/);
});

test('public 24-hour display reads the saved 24-hour rate rather than adding a fixed surcharge', () => {
  assert.match(publicLogic, /full_day:\s*car\.price_24h\s*\?/);
  assert.doesNotMatch(publicLogic, /price_12h\s*\+\s*30000/);
});

test('registration number is optional and blank values are saved as NULL', () => {
  const markup = inputMarkup('v-registration');
  assert.ok(markup, 'registration input exists');
  assert.doesNotMatch(markup, /\brequired\b/);
  assert.match(adminHtml, /Immatriculation \(facultatif\)/);
  assert.match(adminLogic, /registration_number:\$\('v-registration'\)\.value\.trim\(\)\s*\|\|\s*null/);
  assert.match(adminHtml, /registration_number:\$\('v-registration'\)\.value\.trim\(\)\|\|null/);
});
