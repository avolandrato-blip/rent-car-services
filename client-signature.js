(() => {
  const $ = id => document.getElementById(id);
  const signaturePattern = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
  let context = null;
  let drawing = false;
  let hasInk = false;
  let mode = '';
  let bookingSignature = '';
  let savedDocumentSignature = '';
  let originalSlots = new Map();

  function signatureIsValid(value) {
    return typeof value === 'string' && value.length <= 500000 && signaturePattern.test(value);
  }
  function setStatus(message, error = false) {
    const target = mode === 'booking' ? $('booking-client-signature-state') : $('invoice-client-signature-status');
    if (!target) return;
    target.className = `${mode === 'booking' ? 'field-note' : 'booking-result'} ${error ? 'booking-error' : 'booking-success'}`;
    target.textContent = message;
  }
  function prepareCanvas() {
    const canvas = $('invoice-client-signature-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * scale);
    const height = Math.round(rect.height * scale);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      hasInk = false;
    }
    context = canvas.getContext('2d');
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = '#132f45';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
  }
  function clearCanvas() {
    const canvas = $('invoice-client-signature-canvas');
    if (canvas && context) {
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      prepareCanvas();
    }
    hasInk = false;
    drawing = false;
  }
  function coordinates(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function startDrawing(event) {
    if (!context) prepareCanvas();
    if (!context) return;
    event.preventDefault();
    drawing = true;
    hasInk = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = coordinates(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();
  }
  function draw(event) {
    if (!drawing || !context) return;
    event.preventDefault();
    const point = coordinates(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }
  function stopDrawing() { drawing = false; }
  function restoreDocumentSignatureSlots() {
    const root = $('invoice-access-document');
    root?.querySelectorAll('[data-client-signature-slot]').forEach(slot => {
      const original = originalSlots.get(slot.dataset.clientSignatureSlot);
      if (original !== undefined) slot.innerHTML = original;
    });
  }
  function openSharedDialog(nextMode, storedSignature = '') {
    const dialog = $('invoice-client-signature-modal');
    const canvas = $('invoice-client-signature-canvas');
    if (!dialog || !canvas) return false;
    mode = nextMode;
    savedDocumentSignature = signatureIsValid(storedSignature) ? storedSignature : '';
    clearCanvas();
    $('invoice-client-signature-consent').checked = false;
    const title = $('invoice-client-signature-title');
    const description = $('invoice-client-signature-description');
    const consentText = $('invoice-client-signature-consent-text');
    const apply = $('invoice-client-signature-apply');
    const useSaved = $('invoice-client-signature-use-saved');
    const preview = $('invoice-client-signature-saved-preview');
    const printButton = $('invoice-print-button');
    if (mode === 'booking') {
      title.textContent = 'Ajouter une signature à la réservation';
      description.textContent = 'Cette étape est facultative. Si vous confirmez, l’image sera conservée de façon privée avec la réservation et pourra vous être proposée quand vous consulterez vos documents. Elle ne sera pas ajoutée aux documents sans votre confirmation ultérieure.';
      consentText.textContent = 'Je confirme enregistrer cette signature pour pouvoir la proposer ultérieurement sur mes documents.';
      apply.textContent = 'Valider et enregistrer ma signature';
      useSaved.classList.add('hidden');
      preview.classList.add('hidden');
    } else {
      title.textContent = 'Signer la facture et le contrat';
      description.textContent = savedDocumentSignature
        ? 'Une signature a été enregistrée avec cette réservation. Vous pouvez la réutiliser, en redessiner une ou continuer sans signer. Elle ne sera appliquée qu’après votre confirmation.'
        : 'Après avoir lu les deux documents, dessinez votre signature pour les signer, ou choisissez de continuer sans signature : votre partie restera vierge.';
      consentText.textContent = 'Je confirme vouloir apposer cette signature sur la facture et le contrat de cette réservation.';
      apply.textContent = 'Valider et signer les documents';
      useSaved.classList.toggle('hidden', !savedDocumentSignature);
      preview.classList.toggle('hidden', !savedDocumentSignature);
      preview.innerHTML = savedDocumentSignature ? `<span>Signature enregistrée à la réservation</span><img src="${savedDocumentSignature}" alt="Aperçu de la signature enregistrée">` : '';
      printButton?.classList.add('hidden');
    }
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else { dialog.setAttribute('open', ''); dialog.classList.add('is-open'); }
    }
    requestAnimationFrame(() => { prepareCanvas(); });
    return true;
  }
  function applyToDocuments(signatureDataUrl) {
    const root = $('invoice-access-document');
    const slots = [...(root?.querySelectorAll('[data-client-signature-slot]') || [])];
    if (slots.length !== 2 || !slots.some(slot => slot.dataset.clientSignatureSlot === 'invoice') || !slots.some(slot => slot.dataset.clientSignatureSlot === 'contract')) {
      setStatus('Les deux documents ne sont pas prêts. Actualisez la page et réessayez.', true);
      return false;
    }
    if (!signatureIsValid(signatureDataUrl)) {
      setStatus('La signature ne peut pas être utilisée. Effacez le dessin et réessayez.', true);
      return false;
    }
    for (const slot of slots) {
      const image = document.createElement('img');
      image.className = 'document-client-signature-image';
      image.alt = 'Signature du client';
      image.src = signatureDataUrl;
      slot.replaceChildren(image);
    }
    $('invoice-print-button')?.classList.remove('hidden');
    $('invoice-client-signature-modal').close();
    mode = 'documents';
    setStatus('Votre signature est apposée aux deux documents. Vous pouvez les imprimer ou les enregistrer en PDF.');
    return true;
  }
  function declineSignature() {
    const activeMode = mode;
    if (activeMode === 'booking') {
      bookingSignature = '';
      $('booking-client-signature-state').textContent = 'Aucune signature enregistrée. Vous pourrez signer les documents plus tard ou les laisser vierges.';
    } else if (activeMode === 'documents') {
      restoreDocumentSignatureSlots();
      $('invoice-print-button')?.classList.remove('hidden');
      $('invoice-client-signature-status').textContent = 'Vous avez choisi de ne pas signer. Votre partie restera vierge sur la facture et le contrat ; vous pouvez les imprimer ainsi.';
    }
    const modal = $('invoice-client-signature-modal');
    if (typeof modal?.close === 'function') modal.close();
    else { modal?.removeAttribute('open'); modal?.classList.remove('is-open'); }
    mode = activeMode;
  }
  function applyDrawnSignature() {
    const consent = $('invoice-client-signature-consent');
    const canvas = $('invoice-client-signature-canvas');
    if (!hasInk || !canvas) {
      setStatus('Dessinez d’abord votre signature dans la zone.', true);
      return;
    }
    if (!consent?.checked) {
      setStatus(mode === 'booking'
        ? 'Cochez la case pour enregistrer cette signature avec la réservation.'
        : 'Cochez la case pour apposer votre signature sur les deux documents.', true);
      return;
    }
    const signatureDataUrl = canvas.toDataURL('image/png');
    if (!signatureIsValid(signatureDataUrl)) {
      setStatus('La signature ne peut pas être utilisée. Effacez le dessin et réessayez.', true);
      return;
    }
    if (mode === 'booking') {
      bookingSignature = signatureDataUrl;
      $('booking-client-signature-state').textContent = 'Signature prête : elle sera enregistrée avec la réservation et proposée à nouveau au moment des documents.';
      $('invoice-client-signature-modal').close();
      return;
    }
    applyToDocuments(signatureDataUrl);
  }
  function useSavedSignature() {
    if (!savedDocumentSignature) return;
    if (!$('invoice-client-signature-consent')?.checked) {
      setStatus('Cochez la case pour confirmer l’utilisation de cette signature sur les deux documents.', true);
      return;
    }
    applyToDocuments(savedDocumentSignature);
  }
  function resetClientDocumentSignature() {
    if (mode === 'documents') {
      restoreDocumentSignatureSlots();
      $('invoice-print-button')?.classList.add('hidden');
    }
    if ($('invoice-client-signature-modal')?.open) $('invoice-client-signature-modal').close();
    clearCanvas();
    $('invoice-client-signature-consent').checked = false;
    originalSlots = new Map();
    savedDocumentSignature = '';
    mode = '';
  }

  const canvas = $('invoice-client-signature-canvas');
  canvas?.addEventListener('pointerdown', startDrawing);
  canvas?.addEventListener('pointermove', draw);
  canvas?.addEventListener('pointerup', stopDrawing);
  canvas?.addEventListener('pointercancel', stopDrawing);
  $('invoice-client-signature-clear')?.addEventListener('click', () => { clearCanvas(); $('invoice-client-signature-consent').checked = false; });
  $('invoice-client-signature-apply')?.addEventListener('click', applyDrawnSignature);
  $('invoice-client-signature-use-saved')?.addEventListener('click', useSavedSignature);
  $('invoice-client-signature-decline')?.addEventListener('click', declineSignature);
  $('booking-client-signature-open')?.addEventListener('click', () => openSharedDialog('booking'));
  $('invoice-client-signature-modal')?.addEventListener('cancel', event => { event.preventDefault(); declineSignature(); });
  window.addEventListener('resize', () => {
    if ($('invoice-client-signature-modal')?.open) prepareCanvas();
  });
  window.getBookingClientSignature = () => bookingSignature;
  window.clearBookingClientSignature = () => {
    bookingSignature = '';
    const state = $('booking-client-signature-state');
    if (state) state.textContent = 'Aucune signature enregistrée pour le moment.';
  };
  window.showClientDocumentSignature = savedSignature => {
    const root = $('invoice-access-document');
    if (!root) return;
    originalSlots = new Map([...root.querySelectorAll('[data-client-signature-slot]')]
      .map(slot => [slot.dataset.clientSignatureSlot, slot.innerHTML]));
    if (!originalSlots.has('invoice') || !originalSlots.has('contract')) {
      mode = 'documents';
      setStatus('Les zones de signature de la facture et du contrat sont introuvables. Actualisez la page et réessayez.', true);
      return;
    }
    openSharedDialog('documents', savedSignature);
  };
  window.resetClientDocumentSignature = resetClientDocumentSignature;
})();
