const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('la validation admin conserve l’OTP et prépare WhatsApp avec un lien client sans saisie', () => {
  const admin = read('admin-invoice-otp.js');
  assert.match(admin, /crypto\.getRandomValues/);
  assert.match(admin, /otp_code: otp/);
  assert.match(admin, /reservation\.whatsapp_phone \|\| reservation\.customer_phone/);
  assert.match(admin, /invoice: 'access'/);
  assert.match(admin, /reference: reservation\.reference/);
  assert.match(admin, /phone: reservation\.customer_phone/);
  assert.match(admin, /Code OTP facture/);
  assert.match(admin, /sans rien saisir/);
  assert.match(admin, /wa\.me\//);
});

test('le lien retire immédiatement le code du fragment et ouvre automatiquement le parcours client', () => {
  const link = read('client-invoice-link.js');
  const site = read('index.html');
  assert.match(link, /new URLSearchParams\(window\.location\.hash\.slice\(1\)\)/);
  assert.match(link, /history\.replaceState/);
  assert.match(link, /verifyInvoiceOtp\(null, credentials\)/);
  assert.match(site, /id="invoice-access-document"/);
  assert.match(site, /client-invoice-link\.js\?v=/);
});

test('la consultation utilise le endpoint OTP protégé et contrôle les annexes avant affichage', () => {
  const script = read('script.js');
  assert.match(script, /functions\.invoke\('get-invoice-contract-package'/);
  assert.doesNotMatch(script, /from\('reservations'\)\.select\('.*otp_code/);
  assert.match(script, /escapeFunHtml\(doc\.url\)/);
  assert.match(script, /await Promise\.all\(\[\.\.\.document\.images\]/);
  assert.match(script, /brokenImages\.length/);
  assert.match(script, /Aucune saisie supplémentaire n’est nécessaire/);
});

test('les champs contractuels additionnels ne sont récupérés qu’après validation OTP côté serveur', () => {
  const edge = read('supabase/functions/get-invoice-contract-package/index.ts');
  assert.ok(edge.indexOf('get_public_invoice_by_otp') < edge.indexOf('reservationQuery'));
  assert.match(edge, /select: "distance_band,distance_km,minimum_days,license_acquired_place,license_acquired_at,cin_acquired_place,cin_acquired_at,customer_email"/);
  assert.match(edge, /invoice\.reservation = \{ \.\.\.invoice\.reservation, \.\.\.reservationDetails\[0\] \}/);
});
