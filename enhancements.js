(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nowLocal = () => new Date().toISOString();

  function autoTheme() {
    const hour = new Date().getHours();
    document.body.dataset.theme = hour >= 6 && hour < 19 ? 'premium-white' : 'royal-night';
    localStorage.setItem('rentcar-theme-mode', 'auto');
  }

  function addBookingFields() {
    const form = $('booking-form');
    if (!form || $('booking-whatsapp')) return;
    const phone = $('booking-phone')?.closest('label');
    phone?.insertAdjacentHTML('afterend', '<label>WhatsApp actif<input id="booking-whatsapp" required placeholder="034 xx xxx xx"><small class="field-note">Ce numéro recevra la facture et le contrat.</small></label>');
    if (!$('booking-license-place')) $('booking-license')?.closest('label')?.insertAdjacentHTML('afterend', '<div class="date-range identity-meta"><label>Permis délivré à<input id="booking-license-place" required placeholder="Lieu de délivrance"></label><label>Permis délivré le<input id="booking-license-date" type="date" required></label></div>');
    if (!$('booking-cin-place')) $('booking-cin')?.closest('label')?.insertAdjacentHTML('afterend', '<div class="date-range identity-meta"><label>CIN délivrée à<input id="booking-cin-place" required placeholder="Lieu de délivrance"></label><label>CIN délivrée le<input id="booking-cin-date" type="date" required></label></div>');
    $('booking-notes')?.closest('label')?.insertAdjacentHTML('beforebegin', '<label class="checkbox-line terms-consent"><input id="booking-terms-consent" type="checkbox" required> Je reconnais avoir lu et approuvé les conditions de réservation et le contrat.</label>');
    const note = document.createElement('p');
    note.className = 'muted booking-policy-note';
    note.textContent = 'Si 0 Ar d’acompte est payé, la facture et le contrat seront envoyés dès le paiement d’un acompte.';
    $('booking-terms-consent')?.closest('label')?.after(note);
  }

  async function submitReservationEnhanced(event) {
    event.preventDefault();
    const result = $('booking-result');
    const availableVehicles = typeof bookingVehicles !== 'undefined' ? bookingVehicles : [];
    const vehicle = availableVehicles.find(item => item.id === $('booking-vehicle')?.value);
    const startDate = $('booking-start-date')?.value, startTime = $('booking-start-time')?.value;
    const endDate = $('booking-end-date')?.value, endTime = $('booking-end-time')?.value;
    const start = startDate && startTime ? `${startDate}T${startTime}` : '', end = endDate && endTime ? `${endDate}T${endTime}` : '';
    if (!vehicle || !start || !end || new Date(end) <= new Date(start)) return showBookingError('Vérifiez le véhicule et les dates choisies.');
    if (vehicle.driver_mode === 'with_driver' && (vehicle.trip_rates || []).length && !$('booking-trip-rate')?.value) return showBookingError('Veuillez sélectionner le trajet avec chauffeur.');
    if (typeof getVehicleAvailability === 'function' && getVehicleAvailability(vehicle.id, start, end) !== 'available') return showBookingError('Cette voiture n’est pas disponible sur cette période.');
    if (!$('booking-terms-consent')?.checked) return showBookingError('Veuillez cocher la case d’acceptation des conditions.');
    const quote = calculateBookingQuote(vehicle, start, end, $('booking-rental-type').value);
    const deposit = Math.max(0, Number($('booking-deposit').value || 0));
    if (deposit > quote.total) return showBookingError('L’acompte ne peut pas dépasser le montant total.');
    const paymentMethod = $('booking-payment-method').value || null;
    if (deposit > 0 && !paymentMethod) return showBookingError('Sélectionnez le mode de paiement de l’acompte.');
    const customer = {
      full_name: $('booking-name').value.trim(), phone: $('booking-phone').value.trim(), whatsapp_phone: $('booking-whatsapp').value.trim(),
      email: $('booking-email').value.trim() || null, address: $('booking-address').value.trim(), driving_license: $('booking-license').value.trim(), cin: $('booking-cin').value.trim(),
      license_acquired_at: $('booking-license-date').value || null, license_acquired_place: $('booking-license-place').value.trim(),
      cin_acquired_at: $('booking-cin-date').value || null, cin_acquired_place: $('booking-cin-place').value.trim()
    };
    const db = window.rentCarSupabase;
    const customerResult = await db.from('customers').insert(customer).select('id').single();
    if (customerResult.error) return showBookingError('Impossible d’enregistrer la fiche client. Contactez-nous par WhatsApp.');
    const payload = {
      vehicle_id: vehicle.id, customer_id: customerResult.data.id, customer_name: customer.full_name, customer_phone: customer.phone, whatsapp_phone: customer.whatsapp_phone,
      customer_email: customer.email, customer_address: customer.address, customer_license: customer.driving_license, customer_cin: customer.cin,
      license_acquired_at: customer.license_acquired_at, license_acquired_place: customer.license_acquired_place,
      cin_acquired_at: customer.cin_acquired_at, cin_acquired_place: customer.cin_acquired_place,
      start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(), with_driver: $('booking-driver').checked, rental_type: $('booking-rental-type').value,
      rate_12h: quote.rate12, rate_24h: quote.rate24, daily_rate: quote.rate12, days: quote.days, extra_fees: quote.delivery + quote.recovery, total_amount: quote.total,
      deposit_amount: deposit, payment_method: paymentMethod, mobile_reference: $('booking-mobile-reference')?.value.trim() || null, mobile_number: $('booking-mobile-number')?.value.trim() || null,
      trip_from: $('booking-trip-from').value.trim(), trip_to: $('booking-trip-to').value.trim(), trip_rate_label: quote.tripRate ? `${quote.tripRate.from} → ${quote.tripRate.to}` : null, trip_rate_per_day: quote.tripRate ? Number(quote.tripRate.price_per_day || 0) : null, delivery_fee: $('booking-delivery').checked ? 20000 : 0,
      recovery_fee: $('booking-recovery').checked ? 20000 : 0, chauffeur_fee: quote.chauffeur, promo_code: $('booking-promo').value.trim().toUpperCase() || null,
      promo_discount: quote.discount || 0, notes: $('booking-notes').value.trim() || null, terms_accepted_at: nowLocal(), status: deposit > 0 ? 'reserved' : 'pre_reserved'
    };
    const reservationResult = await db.from('reservations').insert(payload).select('id,reference').single();
    if (reservationResult.error) { console.error(reservationResult.error); return showBookingError('Impossible d’enregistrer la réservation pour le moment.'); }
    if (deposit > 0) await db.from('payments').insert({ reservation_id: reservationResult.data.id, amount: deposit, method: paymentMethod, note: 'Acompte à la réservation' });
    const r = reservationResult.data;
    const docs = new FormData(); docs.append('reservation_id', r.id); docs.append('customer_phone', customer.phone);
    [['cinRecto','booking-cin-recto'],['cinVerso','booking-cin-verso'],['permisRecto','booking-license-recto']].forEach(([name, id]) => { const file = $(id)?.files?.[0]; if (file) docs.append(name, file, file.name); });
    if ([...docs.keys()].length > 2) {
      const upload = await db.functions.invoke('upload-identity-documents', { body: docs });
      if (upload.error || upload.data?.error) console.error('identity document upload failed', upload.error || upload.data?.error);
    }
    const message = `Bonjour, je vous transmets ma demande de réservation ${r.reference}.%0AClient : ${encodeURIComponent(customer.full_name)}%0AWhatsApp : ${encodeURIComponent(customer.whatsapp_phone)}%0AVéhicule : ${encodeURIComponent(vehicle.name || vehicle.nom)}%0APériode : ${encodeURIComponent(start)} → ${encodeURIComponent(end)}%0ATotal : ${encodeURIComponent(formatMGA(quote.total))}%0AAcompte : ${encodeURIComponent(formatMGA(deposit))}%0A${deposit === 0 ? 'La facture et le contrat seront envoyés dès paiement d’un acompte.' : 'Merci de confirmer la réception de l’acompte.'}`;
    window.open(`https://wa.me/${siteConfig.footer.whatsapp}?text=${message}`, '_blank');
    result.className = 'booking-result booking-success';
    result.textContent = deposit > 0 ? `Réservation ${r.reference} enregistrée avec acompte.` : `Demande ${r.reference} enregistrée. Facture et contrat après paiement d’un acompte.`;
    $('booking-form').reset();
    if (typeof loadBookingData === 'function') await loadBookingData();
  }

  function showBookingError(message) { const result = $('booking-result'); result.className = 'booking-result booking-error'; result.textContent = message; }

  function enhanceReturnPanel() {
    const section = $('booking');
    if (!section || $('return-public-panel')) return;
    section.querySelector('.invoice-access-panel')?.insertAdjacentHTML('afterend', `<div id="return-public-panel" class="booking-panel return-panel"><h3>Restitution et dégradation</h3><p class="muted">Le loueur remplit ce constat au moment du clic : la date et l’heure sont enregistrées automatiquement.</p><form id="return-public-form"><div class="date-range"><label>Référence réservation<input id="return-reference" required placeholder="RCS-..."></label><label>Type<select id="return-kind"><option value="restitution">Restitution</option><option value="degradation">Dégradation constatée</option></select></label><label>Kilométrage retour<input id="return-km" type="number" min="0" required></label><label>Nombre de clés restituées<input id="return-keys" type="number" min="0" required></label><label>Niveau carburant retour<input id="return-fuel" required placeholder="Ex. 3/4"></label><label>Montant à payer (Ar)<input id="return-due" type="number" min="0" value="0" required></label></div><label>Dégradation constatée<textarea id="return-details" rows="3" placeholder="Détails, photos, observations..."></textarea></label><button class="btn btn-primary" type="submit">Enregistrer et générer la facture</button></form><p id="return-result" class="booking-result"></p></div>`);
    $('return-public-form')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const result = $('return-result'); const ref = $('return-reference').value.trim();
      const {data: reservation, error} = await window.rentCarSupabase.from('reservations').select('id,reference,customer_name,total_amount,deposit_amount,whatsapp_phone,customer_phone').eq('reference', ref).maybeSingle();
      if (error || !reservation) { result.className = 'booking-result booking-error'; result.textContent = 'Référence introuvable.'; return; }
      const payload = { recorded_at: nowLocal(), km_return: Number($('return-km').value), keys_returned: Number($('return-keys').value), fuel_return: $('return-fuel').value, degradation: $('return-details').value, amount_due: Number($('return-due').value || 0), customer_name: reservation.customer_name };
      const saved = await window.rentCarSupabase.from('return_forms').insert({reservation_id: reservation.id, kind: $('return-kind').value, payload});
      if (saved.error) { result.className = 'booking-result booking-error'; result.textContent = 'Impossible d’enregistrer le constat.'; return; }
      result.className = 'booking-result booking-success'; result.textContent = `Constat enregistré le ${new Date().toLocaleString('fr-FR')}. La facture est prête à être générée dans l’administration.`;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    autoTheme(); setInterval(autoTheme, 60000); addBookingFields();
    window.submitReservation = submitReservationEnhanced;
  });
})();
