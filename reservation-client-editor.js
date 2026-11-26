(() => {
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);

  const openReservationClientEditor = id => {
    const allReservations = typeof reservations !== 'undefined' && Array.isArray(reservations) ? reservations : [];
    const reservation = allReservations.find(item => item.id === id);
    if (!reservation) return alert('Réservation introuvable. Actualisez la liste.');

    const allCustomers = typeof customers !== 'undefined' && Array.isArray(customers) ? customers : [];
    const periodRows = window.RentCarBookingPeriods?.groupReservations(reservation, allReservations) || [reservation];
    const reservationIds = [...new Set((periodRows.length ? periodRows : [reservation]).map(item => item.id).filter(Boolean))];
    const linkedCustomerIds = [...new Set((periodRows.length ? periodRows : [reservation]).map(item => item.customer_id).filter(Boolean))];
    if (linkedCustomerIds.length > 1) {
      return alert('Les périodes de cette réservation sont liées à plusieurs fiches client. Aucune modification n’a été faite; vérifiez les fiches liées avant de continuer.');
    }

    const customerId = linkedCustomerIds[0] || null;
    const customer = customerId ? allCustomers.find(item => item.id === customerId) : null;
    const current = (reservationKey, customerKey) =>
      reservation[reservationKey] ?? customer?.[customerKey] ?? '';
    const cinIsDuplicate = reservation.cin_is_duplicate ?? customer?.cin_is_duplicate ?? false;
    const dateValue = value => String(value ?? '').slice(0, 10);

    document.getElementById('reservation-client-edit-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <div id="reservation-client-edit-modal" class="admin-modal-backdrop">
        <div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-client-edit-title">
          <h2 id="reservation-client-edit-title">Modifier les informations client</h2>
          <p class="muted">Réservation : <strong>${escapeHtml(reservation.reference || '—')}</strong>. Les périodes liées seront actualisées ensemble.</p>
          ${customerId ? '' : '<p class="notice">Aucune fiche client n’est liée à ces périodes : l’enregistrement créera une fiche client et la reliera aux réservations concernées.</p>'}
          <form id="reservation-client-edit-form" class="form-grid">
            <div class="field"><label for="rce-full-name">Nom et prénom</label><input id="rce-full-name" autocomplete="name" required value="${escapeHtml(current('customer_name', 'full_name'))}"></div>
            <div class="field"><label for="rce-phone">Téléphone</label><input id="rce-phone" autocomplete="tel" required value="${escapeHtml(current('customer_phone', 'phone'))}"></div>
            <div class="field"><label for="rce-whatsapp">WhatsApp</label><input id="rce-whatsapp" value="${escapeHtml(current('whatsapp_phone', 'whatsapp_phone'))}"></div>
            <div class="field"><label for="rce-email">E-mail</label><input id="rce-email" type="email" autocomplete="email" value="${escapeHtml(current('customer_email', 'email'))}"></div>
            <div class="field full"><label for="rce-address">Adresse</label><input id="rce-address" autocomplete="street-address" value="${escapeHtml(current('customer_address', 'address'))}"></div>
            <div class="field"><label for="rce-cin">CIN</label><input id="rce-cin" value="${escapeHtml(current('customer_cin', 'cin'))}"></div>
            <div class="field"><label for="rce-cin-type">Type de CIN</label><select id="rce-cin-type"><option value="false" ${!cinIsDuplicate ? 'selected' : ''}>Originale</option><option value="true" ${cinIsDuplicate ? 'selected' : ''}>Duplicata</option></select></div>
            <div class="field"><label for="rce-cin-place">CIN délivrée à</label><input id="rce-cin-place" value="${escapeHtml(current('cin_acquired_place', 'cin_acquired_place'))}"></div>
            <div class="field"><label for="rce-cin-date">Date de délivrance CIN</label><input id="rce-cin-date" type="date" value="${escapeHtml(dateValue(current('cin_acquired_at', 'cin_acquired_at')))}"></div>
            <div class="field"><label for="rce-license">Numéro de permis</label><input id="rce-license" value="${escapeHtml(current('customer_license', 'driving_license'))}"></div>
            <div class="field"><label for="rce-license-expiry">Expiration du permis</label><input id="rce-license-expiry" type="date" value="${escapeHtml(dateValue(customer?.license_expiry))}"></div>
            <div class="field"><label for="rce-license-place">Permis délivré à</label><input id="rce-license-place" value="${escapeHtml(current('license_acquired_place', 'license_acquired_place'))}"></div>
            <div class="field"><label for="rce-license-date">Date de délivrance permis</label><input id="rce-license-date" type="date" value="${escapeHtml(dateValue(current('license_acquired_at', 'license_acquired_at')))}"></div>
            <div class="field full"><div class="modal-actions"><button type="button" class="btn outline" id="rce-cancel">Annuler</button><button type="submit" class="btn primary">Enregistrer</button></div></div>
          </form>
        </div>
      </div>
    `);

    const modal = document.getElementById('reservation-client-edit-modal');
    const form = document.getElementById('reservation-client-edit-form');
    document.getElementById('rce-cancel').addEventListener('click', () => modal.remove());
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      submitButton.disabled = true;
      submitButton.textContent = 'Enregistrement…';
      const resetButton = () => {
        submitButton.disabled = false;
        submitButton.textContent = 'Enregistrer';
      };
      const read = fieldId => document.getElementById(fieldId).value.trim() || null;
      const isDuplicate = document.getElementById('rce-cin-type').value === 'true';
      const reservationPayload = {
        customer_name: read('rce-full-name'),
        customer_phone: read('rce-phone'),
        whatsapp_phone: read('rce-whatsapp'),
        customer_email: read('rce-email'),
        customer_address: read('rce-address'),
        customer_cin: read('rce-cin'),
        cin_is_duplicate: isDuplicate,
        cin_acquired_place: read('rce-cin-place'),
        cin_acquired_at: read('rce-cin-date'),
        customer_license: read('rce-license'),
        license_acquired_place: read('rce-license-place'),
        license_acquired_at: read('rce-license-date')
      };
      const customerPayload = {
        full_name: reservationPayload.customer_name,
        phone: reservationPayload.customer_phone,
        whatsapp_phone: reservationPayload.whatsapp_phone,
        email: reservationPayload.customer_email,
        address: reservationPayload.customer_address,
        cin: reservationPayload.customer_cin,
        cin_is_duplicate: isDuplicate,
        cin_acquired_place: reservationPayload.cin_acquired_place,
        cin_acquired_at: reservationPayload.cin_acquired_at,
        driving_license: reservationPayload.customer_license,
        license_acquired_place: reservationPayload.license_acquired_place,
        license_acquired_at: reservationPayload.license_acquired_at,
        license_expiry: read('rce-license-expiry')
      };

      try {
        const database = typeof db !== 'undefined' ? db : window.rentCarSupabase;
        let resolvedCustomerId = customerId;
        let customerWasCreated = false;

        if (!resolvedCustomerId) {
          const { data: phoneMatches, error: lookupError } = await database
            .from('customers')
            .select('id,full_name')
            .eq('phone', customerPayload.phone)
            .limit(2);
          if (lookupError) throw lookupError;
          if ((phoneMatches || []).length > 1) {
            alert('Plusieurs fiches client utilisent ce téléphone. Aucune modification n’a été faite; vérifiez la bonne fiche avant de réessayer.');
            resetButton();
            return;
          }
          if (phoneMatches?.length === 1 && String(phoneMatches[0].full_name || '').trim().toLocaleLowerCase() === customerPayload.full_name.toLocaleLowerCase()) {
            resolvedCustomerId = phoneMatches[0].id;
          } else {
            const { data: createdCustomer, error: createError } = await database
              .from('customers')
              .insert(customerPayload)
              .select('id')
              .single();
            if (createError) throw createError;
            resolvedCustomerId = createdCustomer.id;
            customerWasCreated = true;
          }
        }

        const [reservationResult, customerResult] = await Promise.all([
          database.from('reservations').update({ ...reservationPayload, customer_id: resolvedCustomerId }).in('id', reservationIds),
          customerWasCreated
            ? Promise.resolve({ error: null })
            : database.from('customers').update(customerPayload).eq('id', resolvedCustomerId)
        ]);
        if (reservationResult.error || customerResult.error) {
          const outcomes = [
            reservationResult.error
              ? `réservation : ${reservationResult.error.message}`
              : 'réservation enregistrée',
            customerResult.error
              ? `fiche client : ${customerResult.error.message}`
              : (customerWasCreated ? 'fiche client créée' : 'fiche client enregistrée')
          ];
          if (customerWasCreated && !reservationResult.error) outcomes.push('fiche client liée aux périodes');
          if (customerWasCreated && reservationResult.error) outcomes.push('la fiche créée reste à lier manuellement');
          alert(`Résultat de la mise à jour : ${outcomes.join(' ; ')}. Vérifiez les informations avant de fermer.`);
          await window.refreshAll?.();
          resetButton();
          return;
        }
        modal.remove();
        await window.refreshAll?.();
      } catch (error) {
        alert(`Modification impossible : ${error?.message || 'erreur inattendue'}`);
        resetButton();
      }
    });
  };

  window.openReservationClientEditor = openReservationClientEditor;
})();
