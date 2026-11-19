const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const enhancements = fs.readFileSync(path.join(root, 'enhancements.js'), 'utf8');

test('the final form submit reaches the handler and reports the first invalid step field', () => {
  assert.match(html, /<form id="booking-form" novalidate onsubmit="submitReservation\(event\)">/);
  const formStart = html.indexOf('<form id="booking-form"');
  const formEnd = html.indexOf('</form>', formStart);
  const resultAt = html.indexOf('id="booking-result"', formStart);
  assert.ok(resultAt > formStart && resultAt < formEnd, 'the result message must stay inside the form');
  assert.equal((html.match(/id="booking-result"/g) || []).length, 1);
  assert.match(enhancements, /function findInvalidBookingField\(form\)/);
  assert.match(enhancements, /!item\.disabled && item\.type !== 'hidden' && !item\.checkValidity\(\)/);
  assert.match(enhancements, /invalid\.field\.reportValidity\(\)/);
  assert.match(enhancements, /showBookingError\(label \? `Vérifiez le champ/);
});

test('loading, errors and successful confirmation scroll the result into view', () => {
  assert.match(enhancements, /function scrollBookingResultIntoView\(\)/);
  assert.match(enhancements, /function showBookingError\(message\)[\s\S]*?scrollBookingResultIntoView\(\)/);
  assert.match(enhancements, /result\.textContent = 'Enregistrement de votre demande…'; \}\n\s*scrollBookingResultIntoView\(\)/);
  assert.match(enhancements, /setBookingStep\(1\); updatePaymentProofVisibility\(\);\n\s*scrollBookingResultIntoView\(\)/);
  assert.match(enhancements, /result\.setAttribute\('role', 'alert'\)/);
});

test('a failed availability refresh cannot replace a saved-reservation success with a false failure', () => {
  assert.match(enhancements, /Promise\.resolve\(loadBookingData\(\)\)\.catch\(error => console\.warn\('Réservation enregistrée/);
  assert.doesNotMatch(enhancements, /if \(typeof loadBookingData === 'function'\) await loadBookingData\(\)/);
});
