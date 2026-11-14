(() => {
  function normalizeWhatsAppNumber(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    else if (digits.startsWith('0')) digits = `261${digits.slice(1)}`;
    return digits;
  }

  function makeClientInvoiceLink(reservation, otp) {
    const link = new URL('index.html', window.location.href);
    // Keep the one-time credential in the fragment: it is not sent in HTTP requests or referrers.
    link.hash = new URLSearchParams({
      invoice: 'access',
      reference: reservation.reference || '',
      phone: reservation.customer_phone || '',
      otp
    }).toString();
    return link.href;
  }

  window.sendCustomerSignatureLink = async function sendCustomerSignatureLink(id) {
    const client = window.rentCarSupabase || (typeof db !== 'undefined' ? db : null);
    const status = document.getElementById('admin-preview-status');
    const showStatus = message => { if (status) { status.hidden = false; status.textContent = message; } else alert(message); };
    if (!client) return showStatus('Connexion à la base de données indisponible. Actualisez l’administration et réessayez.');
    const { data: reservation, error: lookupError } = await client.from('reservations')
      .select('id,reference,customer_phone,whatsapp_phone,deposit_amount,total_amount,invoice_released,status')
      .eq('id', id).maybeSingle();
    if (lookupError || !reservation) return showStatus('Réservation introuvable. Actualisez la page et réessayez.');
    if (!reservation.invoice_released || Number(reservation.deposit_amount || 0) <= 0 || reservation.status === 'pre_reserved') {
      return showStatus('Le parcours de signature client est disponible uniquement après validation de l’acompte.');
    }
    const recipient = normalizeWhatsAppNumber(reservation.whatsapp_phone || reservation.customer_phone);
    if (!recipient || !reservation.customer_phone || !reservation.reference) {
      return showStatus('Le téléphone ou la référence manque sur la réservation. Complétez les coordonnées du client avant l’envoi.');
    }
    const random = new Uint32Array(1);
    window.crypto.getRandomValues(random);
    const otp = String(100000 + (random[0] % 900000));
    const whatsappTab = window.open('about:blank', '_blank');
    const { data: updatedReservation, error: updateError } = await client.from('reservations')
      .update({ otp_code: otp }).eq('id', id).select('id').maybeSingle();
    if (updateError || !updatedReservation) {
      whatsappTab?.close();
      const reason = updateError?.message || 'la réservation n’a pas été mise à jour. Vérifiez la session et les droits administrateur.';
      return showStatus(`Impossible de créer le code client : ${reason}`);
    }
    const clientLink = makeClientInvoiceLink(reservation, otp);
    const message = [
      'Rent Car Service — merci de signer votre facture et votre contrat de location.',
      `Référence : ${reservation.reference}`,
      `Téléphone de réservation : ${reservation.customer_phone}`,
      `Code OTP : ${otp}`,
      'Ouvrez le lien sécurisé, vérifiez les deux documents, dessinez votre signature et confirmez pour la faire apparaître sur la facture et le contrat :',
      clientLink,
      'Ce lien est personnel ; ne le transférez pas.'
    ].join('\n');
    const whatsappUrl = `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
    if (whatsappTab) whatsappTab.location.href = whatsappUrl;
    else window.prompt('Copiez ce lien WhatsApp prérempli pour le transmettre au client :', whatsappUrl);
    showStatus('WhatsApp est préparé avec le lien sécurisé et le code OTP. Vérifiez le message puis appuyez sur « Envoyer » pour le transmettre au client.');
  };

  window.approveDeposit = async function approveDeposit(id) {
    const reservation = reservations.find(item => item.id === id);
    if (!reservation) return;
    const recipient = normalizeWhatsAppNumber(reservation.whatsapp_phone || reservation.customer_phone);
    if (!recipient || !reservation.customer_phone || !reservation.reference) {
      alert('Le numéro WhatsApp, le téléphone de réservation ou la référence est manquant. Vérifiez la fiche client avant de valider l’acompte.');
      return;
    }

    const random = new Uint32Array(1);
    window.crypto.getRandomValues(random);
    const otp = String(100000 + (random[0] % 900000));
    const whatsappTab = window.open('about:blank', '_blank');
    const { data: updatedReservation, error } = await db.from('reservations').update({
      status: 'reserved',
      invoice_released: true,
      otp_code: otp
    }).eq('id', id).select('id,status').maybeSingle();

    if (error || !updatedReservation) {
      whatsappTab?.close();
      alert(error?.message || 'Aucune réservation n’a été mise à jour. Vérifiez la session et les droits administrateur, puis actualisez la page.');
      return;
    }

    const clientLink = makeClientInvoiceLink(reservation, otp);
    const message = [
      'Rent Car Service — votre acompte est validé.',
      `Référence de réservation : ${reservation.reference}`,
      `Téléphone de réservation : ${reservation.customer_phone}`,
      `Code OTP facture : ${otp}`,
      'Ouvrez le lien personnel ci-dessous pour afficher directement la facture et le contrat, sans rien saisir :',
      clientLink,
      'Ce lien contient un accès privé à vos documents ; ne le transférez pas.'
    ].join('\n');
    const whatsappUrl = `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;

    if (whatsappTab) whatsappTab.location.href = whatsappUrl;
    else window.prompt('Acompte validé. Copiez ce lien WhatsApp prérempli pour envoyer les informations au client :', whatsappUrl);

    alert('Acompte validé et code OTP enregistré. WhatsApp est préparé avec la référence, le téléphone, le code et un lien qui affiche les documents sans saisie. Appuyez sur « Envoyer » dans WhatsApp pour transmettre le message.');
    await refreshAll();
  };
})();
