const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('le panneau de signature permet de dessiner au doigt et de sauvegarder la signature', () => {
  const html = read('admin.html');
  const script = read('signature-admin.js');
  assert.match(html, /data-tab="signature"/);
  assert.match(html, /id="owner-signature-canvas"/);
  assert.match(html, /id="owner-signature-save"/);
  assert.match(html, /signature-admin\.js\?v=/);
  assert.match(script, /pointerdown/);
  assert.match(script, /pointermove/);
  assert.match(script, /toDataURL\('image\/png'\)/);
  assert.match(script, /from\('admin_signature_settings'\)\.upsert/);
});

test('la signature enregistrée est privée et réservée aux super-administrateurs', () => {
  const migration = read('supabase/migrations/20261108094000_lessor_signature_settings.sql');
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.admin_signature_settings from public, anon, authenticated/i);
  assert.match(migration, /create policy admin_signature_settings_super_admin_only/i);
  assert.match(migration, /public\.is_super_admin\(\)/);
  assert.match(migration, /data:image\/png;base64/);
});

test('chaque facture ou contrat exige une confirmation avant d’apposer la signature enregistrée', () => {
  const operations = read('admin-operations.js');
  assert.match(operations, /window\.confirm\(`Ajouter votre signature à \$\{documentLabel\}/);
  assert.match(operations, /window\.printDocument\(id, kind, approvedSignature\)/);
  assert.match(operations, /Annuler : générer le document sans signature/);
});

test('le gabarit administratif appose la signature du loueur sur contrat et facture, sinon garde la ligne vide', () => {
  const template = read('reference-models.js');
  assert.match(template, /ownerSignatureDataUrl = ''/);
  assert.match(template, /safeOwnerSignature/);
  assert.match(template, /document-owner-signature/);
  assert.match(template, /owner-invoice-signature/);
  assert.match(template, /const signatureCards = tenantSignatureCard \+ ownerSignatureCard/);
  assert.match(template, /document-signature-line/);
});

test('une signature confirmée est rendue dans les deux documents administratifs', async () => {
  const vm = require('node:vm');
  const windows = [];
  const theme = {
    styles: '',
    card: (title, html) => `<section class="document-card"><h3>${title}</h3>${html}</section>`,
    brand: () => '<header>Rent Car Service</header>',
    meta: () => '',
    parties: () => '',
    vehicle: () => '',
    infoGrid: () => '',
    footer: () => '',
  };
  const fakeWindow = {
    RentCarDocumentTheme: theme,
    RentCarContractTerms: {
      getDistanceTerms: () => ({ label: '0–30 km', limit: '30 km', minimumLabel: '12 h' }),
      buildContractTerms: () => '<p>Conditions</p>',
    },
    open: () => {
      const page = { html: '', document: { write(html) { page.html += html; }, close() {} } };
      windows.push(page);
      return page;
    },
  };
  vm.runInNewContext(read('reference-models.js'), {
    window: fakeWindow,
    document: {},
    reservations: [{ id: 'r1', reference: 'RCS-TEST', customer_name: 'Client', total_amount: 100000, deposit_amount: 50000 }],
    vehicles: [{ id: 'v1', name: 'Voiture' }],
    paidFor: () => 50000,
    alert() {},
  });
  const signature = 'data:image/png;base64,aGVsbG8=';
  await fakeWindow.printDocument('r1', 'invoice', signature);
  await fakeWindow.printDocument('r1', 'contract', signature);
  assert.equal(windows.length, 2);
  assert.match(windows[0].html, /owner-invoice-signature/);
  assert.match(windows[0].html, /src="data:image\/png;base64,aGVsbG8="/);
  assert.match(windows[1].html, /document-contract/);
  assert.match(windows[1].html, /src="data:image\/png;base64,aGVsbG8="/);
  assert.match(windows[1].html, /Le locataire/);
});
