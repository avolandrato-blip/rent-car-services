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
    const { error } = await db.from('reservations').update({
      status: 'reserved',
      invoice_released: true,
      otp_code: otp
    }).eq('id', id);

    if (error) {
      whatsappTab?.close();
      alert(error.message);
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
