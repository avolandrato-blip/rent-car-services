(() => {
  const db = window.rentCarSupabase;
  const printOriginal = window.printDocument;
  if (!db || typeof printOriginal !== 'function') return;

  const requiredDocuments = [
    { kind: 'cin_recto', field: 'cinRecto', label: 'CIN — recto' },
    { kind: 'cin_verso', field: 'cinVerso', label: 'CIN — verso' },
    { kind: 'permis_recto', field: 'permisRecto', label: 'Permis — recto' },
  ];
  const acceptedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const maxFileSize = 8 * 1024 * 1024;

  const showMessage = (root, text, isError = false) => {
    const node = root.querySelector('[data-identity-upload-message]');
    if (node) {
      node.textContent = text;
      node.style.color = isError ? '#b42318' : '#166534';
    }
  };

  function showMissingDocumentsDialog(reservationId, phone, missing) {
    document.getElementById('admin-identity-documents-dialog')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'admin-identity-documents-dialog';
    Object.assign(backdrop.style, {
      position: 'fixed', inset: '0', zIndex: '10000', background: '#081827bb',
      display: 'grid', placeItems: 'center', padding: '16px',
    });
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'admin-identity-documents-title');
    Object.assign(dialog.style, {
      background: '#fff', color: '#0b1f33', borderRadius: '14px', padding: '22px',
      width: 'min(560px, 100%)', maxHeight: '90vh', overflow: 'auto',
      font: '15px/1.5 Arial,sans-serif', boxShadow: '0 18px 60px #0005',
    });
    const title = document.createElement('h2');
    title.id = 'admin-identity-documents-title';
    title.textContent = 'Pièces manquantes au contrat';
    title.style.marginTop = '0';
    const explanation = document.createElement('p');
    explanation.textContent = 'Aucune copie enregistrée n’a été trouvée pour les éléments ci-dessous. Ajoutez les photos depuis votre appareil; elles resteront dans le stockage privé et seront intégrées à l’annexe du contrat.';
    const form = document.createElement('form');
    form.noValidate = true;

    for (const item of missing) {
      const label = document.createElement('label');
      label.style.cssText = 'display:block;margin:14px 0;font-weight:700';
      label.append(document.createTextNode(`${item.label} *`));
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.required = true;
      input.dataset.documentField = item.field;
      input.style.cssText = 'display:block;width:100%;margin-top:6px;font-weight:400';
      label.append(input);
      form.append(label);
    }

    const message = document.createElement('p');
    message.dataset.identityUploadMessage = 'true';
    message.setAttribute('role', 'status');
    message.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:16px';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Annuler';
    cancel.style.cssText = 'padding:10px 14px;border:1px solid #ccd5df;border-radius:8px;background:#fff;cursor:pointer';
    cancel.addEventListener('click', () => backdrop.remove());
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.textContent = 'Enregistrer et générer le contrat';
    submit.style.cssText = 'padding:10px 14px;border:0;border-radius:8px;background:#0d5c8f;color:#fff;font-weight:700;cursor:pointer';
    actions.append(cancel, submit);
    form.append(message, actions);
    dialog.append(title, explanation, form);
    backdrop.append(dialog);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
    document.body.append(backdrop);

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const inputs = [...form.querySelectorAll('input[type="file"]')];
      for (const input of inputs) {
        const file = input.files?.[0];
        if (!file) return showMessage(backdrop, 'Sélectionnez chaque pièce demandée.', true);
        if (!acceptedTypes.has(file.type)) return showMessage(backdrop, 'Formats acceptés : JPG, PNG ou WEBP.', true);
        if (file.size <= 0 || file.size > maxFileSize) return showMessage(backdrop, 'Chaque image doit peser au maximum 8 Mo.', true);
      }

      const body = new FormData();
      body.append('reservation_id', reservationId);
      body.append('customer_phone', phone);
      for (const input of inputs) {
        const file = input.files[0];
        body.append(input.dataset.documentField, file, file.name);
      }
      submit.disabled = true;
      cancel.disabled = true;
      showMessage(backdrop, 'Enregistrement sécurisé des photos…');
      try {
        const { data, error } = await db.functions.invoke('upload-identity-documents', { body });
        if (error || data?.error) throw new Error('L’envoi a échoué. Vérifiez votre connexion et réessayez.');
        const uploadedKinds = new Set((data?.uploaded || []).map(item => item.kind));
        if (missing.some(item => !uploadedKinds.has(item.kind))) throw new Error('Toutes les pièces demandées n’ont pas été enregistrées. Réessayez.');
        showMessage(backdrop, 'Photos enregistrées. Ouverture du contrat…');
        backdrop.remove();
        printOriginal(reservationId, 'contract');
      } catch (error) {
        submit.disabled = false;
        cancel.disabled = false;
        showMessage(backdrop, error.message || 'Impossible d’enregistrer les photos. Réessayez.', true);
      }
    });
  }

  window.printDocument = async (reservationId, kind) => {
    if (kind === 'invoice') return printOriginal(reservationId, kind);
    const reservationResult = await db
      .from('reservations')
      .select('id,customer_phone')
      .eq('id', reservationId)
      .maybeSingle();
    if (reservationResult.error || !reservationResult.data?.customer_phone) {
      alert('Impossible de vérifier les pièces de cette réservation. Vérifiez votre connexion et réessayez.');
      return;
    }

    const documentsResult = await db
      .from('contract_documents')
      .select('document_kind,storage_bucket,storage_path,mime_type')
      .eq('reservation_id', reservationId);
    if (documentsResult.error) {
      alert('Impossible de lire les pièces jointes. Le contrat n’a pas été généré afin d’éviter une annexe incomplète.');
      return;
    }

    const validKinds = new Set((documentsResult.data || [])
      .filter(doc => doc.storage_bucket === 'contract-documents'
        && typeof doc.storage_path === 'string'
        && doc.storage_path.startsWith(`${reservationId}/`)
        && acceptedTypes.has(doc.mime_type))
      .map(doc => doc.document_kind));
    const missing = requiredDocuments.filter(item => !validKinds.has(item.kind));
    if (missing.length) {
      showMissingDocumentsDialog(reservationId, reservationResult.data.customer_phone, missing);
      return;
    }
    return printOriginal(reservationId, kind);
  };
})();
