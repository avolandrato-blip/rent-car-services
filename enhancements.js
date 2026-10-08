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
    phone?.insertAdjacentHTML('afterend', '<label>Numéro WhatsApp<input id="booking-whatsapp" required placeholder="Ex. 034 91 207 26"><small class="field-note">Nous utiliserons ce numéro pour vous transmettre la facture et le contrat.</small></label>');
  }

  let currentBookingStep = 1;

  function setBookingStep(step) {
    currentBookingStep = step;
    document.querySelectorAll('[data-booking-step]').forEach(section => section.classList.toggle('active', Number(section.dataset.bookingStep) === step));
    document.querySelectorAll('[data-progress-step]').forEach(item => { const n = Number(item.dataset.progressStep); item.classList.toggle('active', n === step); item.classList.toggle('completed', n < step); });
    const form = $('booking-form'); if (form) form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (step === 4) buildBookingSummary();
  }

  function validateBookingStep(step) {
    const section = document.querySelector(`[data-booking-step="${step}"]`);
    if (!section) return true;
    const fields = [...section.querySelectorAll('input, select, textarea')].filter(field => !field.disabled && field.type !== 'hidden');
    for (const field of fields) { if (!field.checkValidity()) { field.reportValidity(); return false; } }
    if (step === 1) {
      const start = $('booking-start-date')?.value && $('booking-start-time')?.value ? new Date(`${$('booking-start-date').value}T${$('booking-start-time').value}`) : null;
      const end = $('booking-end-date')?.value && $('booking-end-time')?.value ? new Date(`${$('booking-end-date').value}T${$('booking-end-time').value}`) : null;
      if (!start || !end || end <= start) { showBookingError('Veuillez sélectionner une période de location valide.'); return false; }
      const fleetId = $('booking-vehicle')?.value; const slot = window.bookingSlotAvailability?.(fleetId, start.toISOString(), end.toISOString());
      if (slot && !slot.available) { showBookingError('Créneau complet : aucune voiture de cette flotte n’est disponible pour toute la période choisie. Sélectionnez d’autres dates.'); return false; }
      if (slot?.available) window.clearStaleBookingAvailabilityError?.();
    }
    if (step === 3) {
      const deposit = Number($('booking-deposit')?.value || 0);
      const method = $('booking-payment-method')?.value || '';
      if (deposit > 0 && !method) { showBookingError('Veuillez sélectionner le mode de paiement de l’acompte.'); return false; }
      if (deposit > 0 && method === 'mobile_money' && !$('booking-mobile-provider')?.value) { showBookingError('Veuillez sélectionner Orange Money ou Mvola.'); return false; }
      const promo = $('booking-promo')?.value.trim().toUpperCase();
      if (promo && !activePromo) { showBookingError('Le code promotionnel est invalide ou inactif.'); return false; }
    }
    return true;
  }

  function updatePaymentProofVisibility() {
    const deposit = Number($('booking-deposit')?.value || 0);
    const method = $('booking-payment-method')?.value || '';
    const mobile = method === 'mobile_money';
    $('mobile-money-fields')?.classList.toggle('hidden', !(mobile && deposit > 0));
    const paymentMethod = $('booking-payment-method'); if (paymentMethod) paymentMethod.required = deposit > 0;
    const provider = $('booking-mobile-provider'); if (provider) provider.required = mobile && deposit > 0;
    let note = $('mobile-money-instructions');
    if (mobile && deposit > 0) { if (!note) { note = document.createElement('p'); note.id = 'mobile-money-instructions'; note.className = 'field-note'; $('mobile-money-fields')?.before(note); } const date = $('booking-start-date')?.value?.replace(/-/g, '').slice(6, 8) + ($('booking-start-date')?.value?.replace(/-/g, '').slice(4, 6) || ''); note.innerHTML = `Pour régler votre acompte, envoyez <strong>${deposit.toLocaleString('fr-FR')} Ar</strong> au compte indiqué ci-dessous.<br>Motif : <strong>resa_voiture_${date || 'JJMM'}</strong>.`; } else note?.remove();
    updateMobileMoneyAccount();
    window.syncClientRequiredMarks?.($('booking-form') || document);
  }

  function updateMobileMoneyAccount() {
    const provider = $('booking-mobile-provider')?.value || '';
    const account = $('mobile-money-account');
    const number = $('booking-mobile-number');
    const details = {
      orange_money: { label: 'Orange Money', number: '032 42 578 56', name: 'Andrianasolo' },
      mvola: { label: 'Mvola', number: '034 91 207 26', name: 'Andrianasolo' }
    }[provider];
    if (account) account.innerHTML = details ? `Envoyez l’acompte par <strong>${details.label}</strong> au <strong>${details.number}</strong> (${details.name}).` : 'Sélectionnez Orange Money ou Mvola pour afficher le numéro de paiement.';
    if (number) number.value = details?.number || '';
  }

  function buildBookingSummary() {
    const vehicle = $('booking-vehicle')?.selectedOptions?.[0]?.textContent || '—';
    const start = `${$('booking-start-date')?.value || '—'} ${$('booking-start-time')?.value || ''}`;
    const end = `${$('booking-end-date')?.value || '—'} ${$('booking-end-time')?.value || ''}`;
    const deposit = Number($('booking-deposit')?.value || 0);
    const method = $('booking-payment-method')?.selectedOptions?.[0]?.textContent || '—';
    const quote = $('booking-quote')?.textContent || '—';
    const balance = $('booking-balance-note')?.textContent || '—';
    const services = [$('booking-delivery')?.checked ? 'Livraison' : '', $('booking-recovery')?.checked ? 'Récupération' : '', $('booking-driver')?.checked ? 'Chauffeur' : ''].filter(Boolean).join(' · ') || 'Aucun';
    const mobileSelected = $('booking-payment-method')?.value === 'mobile_money';
    const provider = mobileSelected ? ($('booking-mobile-provider')?.selectedOptions?.[0]?.textContent || '—') : '';
    const rows = [['Véhicule', vehicle], ['Départ', start], ['Retour', end], ['Client', $('booking-name')?.value || '—'], ['Téléphone', $('booking-phone')?.value || '—'], ['WhatsApp', $('booking-whatsapp')?.value || '—'], ['Permis', `${$('booking-license')?.value || '—'} — ${$('booking-license-place')?.value || '—'} — ${$('booking-license-date')?.value || '—'}`], ['CIN', `${$('booking-cin')?.value || '—'} — ${$('booking-cin-place')?.value || '—'} — ${$('booking-cin-date')?.value || '—'}${$('booking-cin-type')?.value === 'true' ? ' — Duplicata' : ' — Original'}`], ['Itinéraire', `${$('booking-trip-from')?.value || '—'} → ${$('booking-trip-to')?.value || '—'}`], ['Services', services], ['Tarification', quote], ['Acompte', `${deposit.toLocaleString('fr-FR')} Ar`], ['Solde', balance], ['Mode de paiement', method], ...(mobileSelected ? [['Service Mobile Money', provider]] : [])];
    $('booking-summary').innerHTML = `<dl>${rows.map(([label,value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
  }

  function setupBookingSteps() {
    const form = $('booking-form'); if (!form || form.dataset.stepsReady) return;
    form.dataset.stepsReady = 'true';
    form.querySelectorAll('[data-next-step]').forEach(button => button.addEventListener('click', () => { const step = Number(button.closest('[data-booking-step]').dataset.bookingStep); if (validateBookingStep(step)) setBookingStep(Number(button.dataset.nextStep)); }));
    form.querySelectorAll('[data-prev-step]').forEach(button => button.addEventListener('click', () => setBookingStep(Number(button.dataset.prevStep))));
    ['booking-deposit','booking-payment-method','booking-mobile-provider'].forEach(id => $(id)?.addEventListener('input', updatePaymentProofVisibility));
    $('booking-payment-method')?.addEventListener('change', updatePaymentProofVisibility);
    $('booking-mobile-provider')?.addEventListener('change', updateMobileMoneyAccount);
    updatePaymentProofVisibility(); setBookingStep(1);
  }

  function withReservationTimeout(promise, timeoutMs = 20000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_RESERVATION')), timeoutMs))
    ]);
  }

  async function submitReservationEnhanced(event) {
    event.preventDefault();
    const result = $('booking-result');
    window.syncClientRequiredMarks?.($('booking-form') || document);
    const selectedFleetId = $('booking-vehicle')?.value;
    const fleetGroup = (window.bookingFleets || []).find(group => group.id === selectedFleetId);
    const vehicle = fleetGroup?.vehicle;
    const startDate = $('booking-start-date')?.value, startTime = $('booking-start-time')?.value;
    const endDate = $('booking-end-date')?.value, endTime = $('booking-end-time')?.value;
    const start = startDate && startTime ? `${startDate}T${startTime}` : '', end = endDate && endTime ? `${endDate}T${endTime}` : '';
    if (!vehicle || !start || !end || new Date(end) <= new Date(start)) return showBookingError('Vérifiez le véhicule et les dates choisies.');
    const candidateUnits = window.RentCarFleet.availableUnitsForGroup(fleetGroup, new Date(start).toISOString(), new Date(end).toISOString(), bookingReservations, bookingMaintenance);
    if (!candidateUnits.length) return showBookingError('Toutes les voitures de cette flotte viennent d’être réservées ou sont en maintenance. Actualisez les disponibilités.');
    if (!$('booking-terms-consent')?.checked) return showBookingError('Veuillez cocher la case d’acceptation des conditions.');
    const ownerMode = !!window.bookingOwnerMode;
    const quote = calculateBookingQuote(vehicle, start, end, $('booking-rental-type').value);
    if (quote.unavailable) return showBookingError('Ce véhicule n’est pas disponible dans ce palier kilométrique.');
    const promoCode = $('booking-promo')?.value.trim().toUpperCase() || null;
    const promoState = typeof promoEligibility === 'function' ? promoEligibility(quote) : { valid: true, discount: 0 };
    if (!promoState.valid) return showBookingError(promoState.message);
    const promoDiscount = promoState.discount;
    const finalTotal = Math.max(0, quote.total - Math.min(quote.total, promoDiscount));
    const deposit = Math.max(0, Number($('booking-deposit').value || 0));
    if (quote.requiresQuote && deposit > 0) return showBookingError('Pour une demande de devis, laissez l’acompte à 0 Ar.');
    if (deposit > finalTotal) return showBookingError('L’acompte ne peut pas dépasser le montant total après remise.');
    const paymentMethod = $('booking-payment-method').value || null;
    if (deposit > 0 && !paymentMethod) return showBookingError('Sélectionnez le mode de paiement de l’acompte.');
    const customer = {
      customer_name: $('booking-name').value.trim(), customer_phone: $('booking-phone').value.trim(), whatsapp_phone: $('booking-whatsapp').value.trim(),
      customer_email: $('booking-email').value.trim() || null, customer_address: $('booking-address').value.trim(), customer_license: $('booking-license').value.trim(), license_acquired_place: $('booking-license-place').value.trim(), license_acquired_at: $('booking-license-date').value || null, customer_cin: $('booking-cin').value.trim(), cin_is_duplicate: $('booking-cin-type').value === 'true', cin_acquired_place: $('booking-cin-place').value.trim(), cin_acquired_at: $('booking-cin-date').value || null
    };
    const db = window.rentCarSupabase;
    const payload = {
      ...customer, vehicle_id: vehicle.id,
      start_at: new Date(start).toISOString(), end_at: new Date(end).toISOString(),
      with_driver: vehicle.driver_mode === 'with_driver' || $('booking-driver').checked, rental_type: $('booking-rental-type').value,
      delivery_requested: $('booking-delivery').checked, recovery_requested: $('booking-recovery').checked,
      total_amount: quote.requiresQuote ? 0 : finalTotal, deposit_amount: quote.requiresQuote ? 0 : deposit, payment_method: quote.requiresQuote ? null : paymentMethod,
      mobile_reference: quote.requiresQuote ? null : ($('booking-mobile-reference')?.value.trim() || null),
      mobile_number: quote.requiresQuote ? null : ($('booking-mobile-number')?.value.trim() || null),
      mobile_provider: $('booking-mobile-provider')?.value || null,
      trip_rate_id: null,
      trip_from: $('booking-trip-from').value.trim(), trip_to: $('booking-trip-to').value.trim(),
      trip_rate_label: null, trip_rate_per_day: null, province_zone: null,
      distance_band: quote.distanceBand, distance_km: quote.distanceBand === '0_30' ? 30 : quote.distanceBand === '30_100' ? 100 : quote.distanceBand === '100_200' ? 200 : 201,
      minimum_days: quote.band.minDays, quote_requested: quote.requiresQuote, quote_reason: quote.quoteReason || null,
      promo_code: promoCode, notes: $('booking-notes').value.trim() || null,
      terms_accepted_at: nowLocal()
    };
    let reservationResult = null;
    let reservedUnit = null;
    for (const unit of candidateUnits) {
      const attempt = await withReservationTimeout(db.rpc('create_public_distance_reservation', { p_payload: { ...payload, vehicle_id: unit.id } }));
      if (!attempt.error) {
        const row = Array.isArray(attempt.data) ? attempt.data[0] : attempt.data;
        if (row?.id && row?.reference) { reservationResult = { data: row }; reservedUnit = unit; break; }
        return showBookingError('La réservation n’a pas pu être confirmée. Actualisez la page puis réessayez.');
      }
      if (attempt.error.code !== '23P01') { console.error(attempt.error); return showBookingError(reservationErrorMessage(attempt.error)); }
    }
    if (!reservationResult) return showBookingError('Les dernières voitures disponibles viennent d’être réservées. Actualisez le calendrier puis réessayez.');
    // La page publique ne crée pas de ligne payments : cette table est réservée à l’admin. Le montant déclaré reste dans reservations.deposit_amount et sera validé depuis l’admin.
    const r = reservationResult.data;
    const recipient = ownerMode && reservedUnit.owner_phone ? String(reservedUnit.owner_phone).replace(/\D/g, '') : String(siteConfig.footer.whatsapp).replace(/\D/g, '');
    const message = `${ownerMode ? 'Bonjour, cette demande provient du site Rent Car Service.' : 'Bonjour, je vous transmets ma demande de réservation.'}%0ARéférence : ${encodeURIComponent(r.reference)}%0AClient : ${encodeURIComponent(customer.customer_name)}%0ATéléphone : ${encodeURIComponent(customer.customer_phone)}%0AWhatsApp : ${encodeURIComponent(customer.whatsapp_phone)}%0AVéhicule : ${encodeURIComponent(reservedUnit.name || reservedUnit.nom)}%0APériode : ${encodeURIComponent(start)} → ${encodeURIComponent(end)}%0A${quote.requiresQuote ? `Montant : demande de devis (${encodeURIComponent(quote.quoteReason || 'à confirmer')})` : `Total estimé : ${encodeURIComponent(formatMGA(finalTotal))}`}%0A${ownerMode ? 'Merci de confirmer la disponibilité de cette voiture.' : (deposit === 0 ? 'La facture et le contrat seront envoyés dès paiement d’un acompte.' : 'Merci de confirmer la réception de l’acompte.')}`;
    window.open(`https://wa.me/${recipient}?text=${message}`, '_blank');
    result.className = 'booking-result booking-success';
    const reservationMessage = quote.requiresQuote ? `Votre demande de devis (${r.reference}) a bien été enregistrée. Nous allons vous confirmer le tarif et la disponibilité.` : deposit > 0 ? `Votre demande de réservation (${r.reference}) a bien été enregistrée avec l’acompte indiqué. La période est bloquée sous réserve de validation de l’acompte.` : `Votre demande de réservation (${r.reference}) a bien été enregistrée. La période reste disponible jusqu’au versement et à la validation de l’acompte.`;
    result.textContent = reservationMessage;
    $('booking-form').reset();
    $('invoice-access-panel')?.classList.toggle('hidden', deposit <= 0);
    setBookingStep(1); updatePaymentProofVisibility();
    if (typeof loadBookingData === 'function') await loadBookingData();
  }

  function reservationErrorMessage(error) { const raw = String(error?.message || ''); const known = raw.includes('Price changed') ? 'Le tarif a changé depuis l’ouverture du formulaire. Actualisez la page puis vérifiez le total.' : raw.includes('Duration requires a quote') ? 'Cette durée est disponible uniquement sur devis.' : raw.includes('Province pricing requires a quote') ? 'Cette zone est disponible uniquement sur devis.' : raw.includes('Province zone unavailable') ? 'Cette zone n’est pas disponible pour ce véhicule.' : raw.includes('Vehicle unavailable') ? 'Ce véhicule n’est plus disponible pour cette période.' : raw.includes('Invalid booking dates') ? 'Les dates de réservation sont invalides ou déjà passées.' : raw.includes('Terms acceptance required') ? 'Veuillez cocher l’acceptation des conditions.' : raw.includes('Payment method required') ? 'Veuillez sélectionner le mode de paiement de l’acompte.' : raw.includes('Invalid deposit amount') ? 'Le montant de l’acompte est invalide.' : 'Impossible d’enregistrer la réservation. Actualisez la page puis réessayez.'; return known; }
  function showBookingError(message) { const result = $('booking-result'); result.className = 'booking-result booking-error'; result.textContent = message; }

  function enhanceReturnPanel() {
    const section = $('booking');
    if (!section || $('return-public-panel')) return;
    section.querySelector('.invoice-access-panel')?.insertAdjacentHTML('afterend', `<div id="return-public-panel" class="booking-panel return-panel"><h3>Restitution et signalement</h3><p class="muted">Le loueur renseigne ce formulaire au moment de la restitution ou du signalement. La date et l’heure sont enregistrées automatiquement.</p><form id="return-public-form"><div class="date-range"><label>Référence de réservation<input id="return-reference" required placeholder="RCS-..."></label><label>Type<select id="return-kind"><option value="restitution">Restitution</option><option value="degradation">Signalement d’une dégradation</option></select></label><label>Kilométrage à la restitution<input id="return-km" type="number" min="0" required></label><label>Nombre de clés restituées<input id="return-keys" type="number" min="0" required></label><label>Niveau de carburant à la restitution<input id="return-fuel" required placeholder="Ex. 3/4"></label><label>Montant dû (Ar)<input id="return-due" type="number" min="0" value="0" required></label></div><label>Observations ou dégradations constatées<textarea id="return-details" rows="3" placeholder="Détails, photos, observations..."></textarea></label><button class="btn btn-primary" type="submit">Enregistrer le formulaire</button></form><p id="return-result" class="booking-result"></p></div>`);
    window.syncClientRequiredMarks?.($('return-public-panel'));
    $('return-public-form')?.addEventListener('submit', async (e) => {
      e.preventDefault(); const result = $('return-result'); const ref = $('return-reference').value.trim();
      const {data: reservation, error} = await window.rentCarSupabase.from('reservations').select('id,reference,customer_name,total_amount,deposit_amount,whatsapp_phone,customer_phone').eq('reference', ref).maybeSingle();
      if (error || !reservation) { result.className = 'booking-result booking-error'; result.textContent = 'Aucune réservation ne correspond à cette référence.'; return; }
      const payload = { recorded_at: nowLocal(), km_return: Number($('return-km').value), keys_returned: Number($('return-keys').value), fuel_return: $('return-fuel').value, degradation: $('return-details').value, amount_due: Number($('return-due').value || 0), customer_name: reservation.customer_name };
      const saved = await window.rentCarSupabase.from('return_forms').insert({reservation_id: reservation.id, kind: $('return-kind').value, payload});
      if (saved.error) { result.className = 'booking-result booking-error'; result.textContent = 'Impossible d’enregistrer ce constat. Veuillez réessayer ou nous contacter.'; return; }
      result.className = 'booking-result booking-success'; result.textContent = `Constat enregistré le ${new Date().toLocaleString('fr-FR')}. La facture est prête à être générée dans l’administration.`;
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    autoTheme(); setInterval(autoTheme, 60000); addBookingFields(); setupBookingSteps(); window.syncClientRequiredMarks?.(document);
    window.submitReservation = async (event) => {
      const form = $('booking-form');
      const result = $('booking-result');
      const submitButton = form?.querySelector('button[type=submit]');
      if (submitButton) { submitButton.disabled = true; submitButton.dataset.originalText = submitButton.textContent; submitButton.textContent = 'Enregistrement…'; }
      if (result) { result.className = 'booking-result'; result.textContent = 'Enregistrement de votre demande…'; }
      try {
        await submitReservationEnhanced(event);
      } catch (error) {
        console.error('Reservation submission failed:', error);
        if (result) {
          result.className = 'booking-result booking-error';
          result.textContent = error?.message === 'TIMEOUT_RESERVATION'
            ? 'Le serveur met trop de temps à répondre. Vérifiez votre référence avant de recommencer, afin d’éviter une double réservation.'
            : 'La réservation n’a pas pu être enregistrée. Vérifiez les informations puis réessayez.';
        }
      } finally {
        if (submitButton) { submitButton.disabled = false; submitButton.textContent = submitButton.dataset.originalText || 'Confirmer la réservation'; }
      }
    };
  });
})();
