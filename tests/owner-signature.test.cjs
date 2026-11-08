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

test('la signature client est saisie et apposée sur les deux documents sans stockage local ou serveur', () => {
  const html = read('index.html');
  const publicScript = read('client-signature.js');
  const documentGenerator = read('script.js');
  assert.match(html, /id="invoice-client-signature-canvas"/);
  assert.match(html, /id="invoice-client-signature-apply"/);
  assert.match(html, /ne l’enregistre pas/);
  assert.match(documentGenerator, /data-client-signature-slot="invoice"/);
  assert.match(documentGenerator, /data-client-signature-slot="contract"/);
  assert.match(documentGenerator, /window\.showClientDocumentSignature\?\.\(\)/);
  assert.match(publicScript, /canvas\.toDataURL\('image\/png'\)/);
  assert.match(publicScript, /slot\.replaceChildren\(image\)/);
  assert.doesNotMatch(publicScript, /localStorage|sessionStorage|rentCarSupabase|fetch\(|sign_contract|contract_signatures/);
  assert.match(documentGenerator, /invoice-print-button'\)\?\.classList\.add\('hidden'\)/);
});

test('les anciens RPC de signature persistée sont désactivés pour les clients', () => {
  const migration = read('supabase/migrations/20261108105000_disable_persisted_client_signing.sql');
  assert.match(migration, /revoke all on function public\.create_contract_signing_link\(uuid\) from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.get_contract_for_signing\(text\) from public, anon, authenticated/i);
  assert.match(migration, /revoke all on function public\.sign_contract\(text, text, text, text, text, text, text\) from public, anon, authenticated/i);
});


test('le paquet OTP ne renvoie la signature du loueur qu’après libération des documents', () => {
  const edge = read('supabase/functions/get-invoice-contract-package/index.ts');
  assert.match(edge, /get_public_invoice_by_otp/);
  assert.match(edge, /admin_signature_settings/);
  assert.match(edge, /return response\(\{ invoice, documents, lessorSignature: safeLessorSignature \}\)/);
  assert.match(edge, /data:image\\\/png;base64/);
});

test('le tampon fourni et la signature du loueur apparaissent dans la facture et le contrat client', () => {
  const script = read('script.js');
  assert.ok(fs.existsSync(path.join(root, 'images/owner-stamp.png')));
  assert.match(script, /images\/owner-stamp\.png/);
  assert.match(script, /data:image\\\/png;base64/);
  assert.match(script, /document-owner-signature-slot/);
  assert.match(script, /Signature du loueur/);
});

test('le parcours client en mémoire exige dessin et confirmation avant de débloquer l’impression', () => {
  const vm = require('node:vm');
  const handlers = {};
  const makeElement = () => {
    const classes = new Set(['hidden']);
    return {
      className: '', textContent: '', checked: false, width: 0, height: 0,
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
      addEventListener: (name, handler) => { handlers[name] = handler; },
    };
  };
  const panel = makeElement();
  const canvas = makeElement();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 180 });
  canvas.getContext = () => ({ setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} });
  canvas.setPointerCapture = () => {};
  canvas.toDataURL = () => 'data:image/png;base64,dGVzdA==';
  const slots = ['invoice', 'contract'].map(kind => ({
    dataset: { clientSignatureSlot: kind },
    innerHTML: '<div class="document-signature-line"></div>Signature',
    replaceChildren(image) { this.image = image; },
  }));
  const documentRoot = { querySelectorAll: () => slots };
  const consent = makeElement();
  const printButton = makeElement();
  const status = makeElement();
  const elements = {
    'invoice-client-signature-panel': panel,
    'invoice-client-signature-canvas': canvas,
    'invoice-client-signature-consent': consent,
    'invoice-client-signature-apply': makeElement(),
    'invoice-client-signature-clear': makeElement(),
    'invoice-client-signature-status': status,
    'invoice-access-document': documentRoot,
    'invoice-print-button': printButton,
  };
  const fakeDocument = {
    getElementById: id => elements[id] || null,
    createElement: () => ({ className: '', alt: '', src: '' }),
  };
  const fakeWindow = { devicePixelRatio: 1, addEventListener() {}, showClientDocumentSignature: undefined };
  const context = { document: fakeDocument, window: fakeWindow, requestAnimationFrame: callback => callback() };
  vm.runInNewContext(read('client-signature.js'), context);
  fakeWindow.showClientDocumentSignature();
  assert.equal(panel.classList.contains('hidden'), false);
  handlers.pointerdown({ preventDefault() {}, currentTarget: canvas, pointerId: 1, clientX: 30, clientY: 40 });
  handlers.pointermove({ preventDefault() {}, currentTarget: canvas, pointerId: 1, clientX: 60, clientY: 50 });
  handlers.pointerup();
  consent.checked = true;
  handlers.click();
  assert.ok(slots.every(slot => slot.image?.src === 'data:image/png;base64,dGVzdA=='));
  assert.equal(printButton.classList.contains('hidden'), false);
  assert.match(status.textContent, /ne sera pas enregistrée sur le site/);
});
