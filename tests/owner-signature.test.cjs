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

test('chaque facture ou contrat admin appose automatiquement la signature enregistrée sans confirmation', () => {
  const operations = read('admin-operations.js');
  assert.match(operations, /window\.printDocument\(id, kind, savedSignature\)/);
  assert.match(operations, /signatureState\.error \|\| !savedSignature/);
  assert.doesNotMatch(operations, /Ajouter votre signature à/);
  assert.match(operations, /Faire signer par le client/);
  assert.match(operations, /window\.sendCustomerSignatureLink/);
});

test('le lien de signature client admin exige un acompte libéré et prépare un message WhatsApp OTP', () => {
  const otp = read('admin-invoice-otp.js');
  assert.match(otp, /window\.sendCustomerSignatureLink/);
  assert.match(otp, /!reservation\.invoice_released/);
  assert.match(otp, /Number\(reservation\.deposit_amount \|\| 0\) <= 0/);
  assert.match(otp, /signer votre facture et votre contrat/);
  assert.match(otp, /makeClientInvoiceLink\(reservation, otp\)/);
});

test('le gabarit administratif appose la signature du loueur sur contrat et facture, sinon garde la ligne vide', () => {
  const template = read('reference-models.js');
  assert.match(template, /ownerSignatureDataUrl = ''/);
  assert.match(template, /safeOwnerSignature/);
  assert.match(template, /owner-stamp\.png/);
  assert.match(template, /document-owner-stamp-image/);
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
  const clientSignature = 'data:image/png;base64,Y2xpZW50';
  await fakeWindow.printDocument('r1', 'invoice', signature, clientSignature);
  await fakeWindow.printDocument('r1', 'contract', signature, clientSignature);
  assert.equal(windows.length, 2);
  assert.match(windows[0].html, /owner-invoice-signature/);
  assert.match(windows[0].html, /owner-stamp\.png/);
  assert.match(windows[0].html, /src="data:image\/png;base64,aGVsbG8="/);
  assert.match(windows[0].html, /src="data:image\/png;base64,Y2xpZW50"/);
  assert.match(windows[1].html, /document-contract/);
  assert.match(windows[1].html, /owner-stamp\.png/);
  assert.match(windows[1].html, /src="data:image\/png;base64,aGVsbG8="/);
  assert.match(windows[1].html, /document-client-signature-image/);
  assert.match(windows[1].html, /src="data:image\/png;base64,Y2xpZW50"/);
  assert.match(windows[1].html, /Le locataire/);
});

test('le contrat chauffeur récupère les signatures privées via un RPC limité à sa mission', () => {
  const team = read('team.js');
  const html = read('team.html');
  const template = read('reference-models.js');
  const migration = read('supabase/migrations/20261111111421_team_contract_signature_rpc.sql');
  assert.match(team, /get_chauffeur_mission_contract_signatures/);
  assert.match(team, /signatures\.lessor_signature_data/);
  assert.match(team, /signatures\.client_signature_data/);
  assert.match(team, /window\.open\('',\s*'_blank'\)/);
  assert.match(html, /reference-models\.js\?v=20261111-team-contract-signatures/);
  assert.match(template, /clientSignatureDataUrl = ''/);
  assert.match(template, /document-client-signature-image/);
  assert.match(migration, /security definer/i);
  assert.match(migration, /chauffeur\.auth_user_id = auth\.uid\(\)/);
  assert.match(migration, /mission\.status in \('assigned', 'accepted', 'in_progress'\)/);
  assert.match(migration, /revoke all on function public\.get_chauffeur_mission_contract_signatures\(uuid\) from public, anon/i);
  assert.doesNotMatch(migration, /grant select on public\.(reservation_client_signatures|admin_signature_settings)/i);
});

test('le dialogue de signature client est réutilisé à la réservation et aux documents', () => {
  const html = read('index.html');
  const publicScript = read('client-signature.js');
  const documentGenerator = read('script.js');
  assert.match(html, /id="booking-client-signature-open"/);
  assert.match(html, /id="invoice-client-signature-modal"/);
  assert.match(html, /id="invoice-client-signature-canvas"/);
  assert.match(html, /id="invoice-client-signature-apply"/);
  assert.match(publicScript, /window\.getBookingClientSignature/);
  assert.match(documentGenerator, /data-client-signature-slot="invoice"/);
  assert.match(documentGenerator, /data-client-signature-slot="contract"/);
  assert.match(documentGenerator, /window\.showClientDocumentSignature\?\.\(packageData\.customerSignature \|\| ''\)/);
  assert.match(documentGenerator, /create_public_distance_reservation/);
  assert.match(documentGenerator, /save_public_reservation_signature/);
  assert.match(documentGenerator, /extra_driver_requested: Boolean\(document\.getElementById\('booking-driver'\)\.checked\)/);
  assert.match(publicScript, /canvas\.toDataURL\('image\/png'\)/);
  assert.match(publicScript, /slot\.replaceChildren\(image\)/);
  assert.doesNotMatch(publicScript, /localStorage|sessionStorage|rentCarSupabase|fetch\(|sign_contract|contract_signatures/);
  assert.match(html, /Continuer sans signer/);
  assert.match(publicScript, /restoreDocumentSignatureSlots\(\)/);
  assert.match(documentGenerator, /invoice-print-button'\)\?\.classList\.add\('hidden'\)/);
});

test('la signature client est conservée dans une table privée et n’est renvoyée qu’après OTP', () => {
  const migration = read('supabase/migrations/20261108152000_private_client_reservation_signatures.sql');
  const edge = read('supabase/functions/get-invoice-contract-package/index.ts');
  assert.match(migration, /reservation_client_signatures ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.reservation_client_signatures FROM PUBLIC, anon, authenticated/i);
  assert.match(migration, /save_public_reservation_signature/);
  assert.match(migration, /r\.reference = left\(trim\(coalesce\(p_reference/);
  assert.match(edge, /reservation_client_signatures/);
  assert.match(edge, /customerSignature: safeCustomerSignature/);
  assert.ok(edge.indexOf('get_public_invoice_by_otp') < edge.indexOf('reservation_client_signatures'));
});

test('le RPC public distingue le chauffeur inclus du supplément chauffeur sélectionné', () => {
  const migration = read('supabase/migrations/20261108152400_public_booking_extra_driver_flag.sql');
  assert.match(migration, /v_extra_driver_requested boolean/);
  assert.match(migration, /and v_extra_driver_requested/);
  assert.match(migration, /v_with_driver\);/);
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
  assert.match(edge, /return response\(\{ invoice, documents, lessorSignature: safeLessorSignature, customerSignature: safeCustomerSignature \}\)/);
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

test('le dialogue client signe sur confirmation et laisse vierges les deux zones si le client refuse', () => {
  const vm = require('node:vm');
  const makeElement = () => {
    const classes = new Set(['hidden']);
    return {
      className: '', textContent: '', checked: false, width: 0, height: 0, innerHTML: '',
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), toggle: (value, force) => force ? classes.add(value) : classes.delete(value), contains: value => classes.has(value) },
      addEventListener(name, handler) { this[`on${name}`] = handler; },
    };
  };
  const canvas = makeElement();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 180 });
  canvas.getContext = () => ({ setTransform() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, clearRect() {} });
  canvas.setPointerCapture = () => {};
  canvas.toDataURL = () => 'data:image/png;base64,dGVzdA==';
  const slots = ['invoice', 'contract'].map(kind => {
    const slot = {
      dataset: { clientSignatureSlot: kind },
      image: null,
      replaceChildren(image) { this.innerHTML = ''; this.image = image; },
    };
    let html = '<div class="document-signature-line"></div>Signature';
    Object.defineProperty(slot, 'innerHTML', {
      get: () => html,
      set: value => { html = value; slot.image = null; },
    });
    return slot;
  });
  const documentRoot = { querySelectorAll: () => slots };
  const consent = makeElement();
  const printButton = makeElement();
  const status = makeElement();
  const dialog = makeElement();
  dialog.open = false;
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const elements = {
    'invoice-client-signature-modal': dialog,
    'invoice-client-signature-title': makeElement(),
    'invoice-client-signature-description': makeElement(),
    'invoice-client-signature-consent-text': makeElement(),
    'invoice-client-signature-saved-preview': makeElement(),
    'invoice-client-signature-use-saved': makeElement(),
    'invoice-client-signature-decline': makeElement(),
    'invoice-client-signature-panel': makeElement(),
    'invoice-client-signature-canvas': canvas,
    'invoice-client-signature-consent': consent,
    'invoice-client-signature-apply': makeElement(),
    'invoice-client-signature-clear': makeElement(),
    'invoice-client-signature-status': status,
    'booking-client-signature-state': makeElement(),
    'invoice-access-document': documentRoot,
    'invoice-print-button': printButton,
  };
  const fakeDocument = {
    getElementById: id => elements[id] || null,
    createElement: () => ({ className: '', alt: '', src: '' }),
  };
  const fakeWindow = { devicePixelRatio: 1, addEventListener() {} };
  const context = { document: fakeDocument, window: fakeWindow, requestAnimationFrame: callback => callback() };
  vm.runInNewContext(read('client-signature.js'), context);
  fakeWindow.showClientDocumentSignature();
  assert.equal(dialog.open, true);
  canvas.onpointerdown({ preventDefault() {}, currentTarget: canvas, pointerId: 1, clientX: 30, clientY: 40 });
  canvas.onpointermove({ preventDefault() {}, currentTarget: canvas, clientX: 60, clientY: 50 });
  canvas.onpointerup();
  consent.checked = true;
  elements['invoice-client-signature-apply'].onclick();
  assert.ok(slots.every(slot => slot.image?.src === 'data:image/png;base64,dGVzdA=='));
  assert.equal(printButton.classList.contains('hidden'), false);
  assert.match(status.textContent, /apposée aux deux documents/);

  fakeWindow.resetClientDocumentSignature();
  fakeWindow.showClientDocumentSignature();
  elements['invoice-client-signature-decline'].onclick();
  assert.ok(slots.every(slot => !slot.image && slot.innerHTML.includes('document-signature-line')));
  assert.equal(printButton.classList.contains('hidden'), false);
  assert.match(status.textContent, /Votre partie restera vierge/);
});
