(() => {
  const $ = id => document.getElementById(id);
  let context = null;
  let drawing = false;
  let hasInk = false;
  let signatureApplied = false;
  let originalSlots = new Map();

  function status(message, error = false) {
    const node = $('invoice-client-signature-status');
    if (!node) return;
    node.className = `booking-result ${error ? 'booking-error' : 'booking-success'}`;
    node.textContent = message;
  }

  function prepareCanvas() {
    const canvas = $('invoice-client-signature-canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const scale = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * scale);
    const height = Math.round(rect.height * scale);
    const resized = canvas.width !== width || canvas.height !== height;
    if (resized) {
      canvas.width = width;
      canvas.height = height;
      if (hasInk) {
        hasInk = false;
        status('La zone a changé de taille. Redessinez votre signature avant de continuer.', true);
      }
    }
    context = canvas.getContext('2d');
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.strokeStyle = '#132f45';
    context.lineWidth = 3;
    context.lineCap = 'round';
    context.lineJoin = 'round';
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

  function resetSignature() {
    const canvas = $('invoice-client-signature-canvas');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    hasInk = false;
    drawing = false;
    signatureApplied = false;
    const documentRoot = $('invoice-access-document');
    documentRoot?.querySelectorAll('[data-client-signature-slot]').forEach(slot => {
      const original = originalSlots.get(slot.dataset.clientSignatureSlot);
      if (original !== undefined) slot.innerHTML = original;
    });
    $('invoice-client-signature-consent').checked = false;
    $('invoice-print-button')?.classList.add('hidden');
    status('Le dessin a été effacé. Vous pouvez signer à nouveau.');
  }

  function showSignaturePanel() {
    const panel = $('invoice-client-signature-panel');
    const documentRoot = $('invoice-access-document');
    if (!panel || !documentRoot) return;
    originalSlots = new Map([...documentRoot.querySelectorAll('[data-client-signature-slot]')]
      .map(slot => [slot.dataset.clientSignatureSlot, slot.innerHTML]));
    if (!originalSlots.has('invoice') || !originalSlots.has('contract')) {
      status('Les zones de signature du contrat et de la facture sont introuvables. Actualisez la page et réessayez.', true);
      return;
    }
    const canvas = $('invoice-client-signature-canvas');
    if (canvas) { canvas.width = 0; canvas.height = 0; }
    hasInk = false;
    signatureApplied = false;
    panel.classList.remove('hidden');
    $('invoice-print-button')?.classList.add('hidden');
    requestAnimationFrame(prepareCanvas);
    status('Lisez les documents, dessinez votre signature, puis confirmez pour l’apposer aux deux documents.');
  }

  function applySignatureToDocuments() {
    const canvas = $('invoice-client-signature-canvas');
    const consent = $('invoice-client-signature-consent');
    const documentRoot = $('invoice-access-document');
    const slots = [...(documentRoot?.querySelectorAll('[data-client-signature-slot]') || [])];
    if (!hasInk || !canvas) {
      status('Dessinez d’abord votre signature dans la zone.', true);
      return;
    }
    if (!consent?.checked) {
      status('Cochez la confirmation pour apposer votre signature sur le contrat et la facture.', true);
      return;
    }
    if (slots.length !== 2 || !slots.some(slot => slot.dataset.clientSignatureSlot === 'invoice') || !slots.some(slot => slot.dataset.clientSignatureSlot === 'contract')) {
      status('Les deux documents ne sont pas prêts. Actualisez la page et réessayez.', true);
      return;
    }
    const signatureDataUrl = canvas.toDataURL('image/png');
    if (!signatureDataUrl.startsWith('data:image/png;base64,') || signatureDataUrl.length > 500000) {
      status('La signature ne peut pas être utilisée. Effacez le dessin et réessayez.', true);
      return;
    }
    for (const slot of slots) {
      const image = document.createElement('img');
      image.className = 'document-client-signature-image';
      image.alt = 'Signature manuscrite du client';
      image.src = signatureDataUrl;
      slot.replaceChildren(image);
    }
    signatureApplied = true;
    $('invoice-print-button')?.classList.remove('hidden');
    status('Signature ajoutée au contrat et à la facture dans cette page. Elle ne sera pas enregistrée sur le site. Vous pouvez maintenant imprimer ou enregistrer le PDF.');
  }

  const canvas = $('invoice-client-signature-canvas');
  canvas?.addEventListener('pointerdown', startDrawing);
  canvas?.addEventListener('pointermove', draw);
  canvas?.addEventListener('pointerup', stopDrawing);
  canvas?.addEventListener('pointercancel', stopDrawing);
  $('invoice-client-signature-clear')?.addEventListener('click', resetSignature);
  $('invoice-client-signature-apply')?.addEventListener('click', applySignatureToDocuments);
  window.addEventListener('resize', () => {
    if (!$('invoice-client-signature-panel')?.classList.contains('hidden')) prepareCanvas();
  });
  window.showClientDocumentSignature = showSignaturePanel;
  window.resetClientDocumentSignature = resetSignature;
})();
