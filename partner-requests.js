(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const modal = $('partner-modal');
  const form = $('partner-request-form');
  if (!modal || !form) return;
  const setMode = type => {
    const owner = type === 'vehicle-owner';
    modal.dataset.mode = owner ? 'owner' : 'business';
    $('partner-request-type').value = owner ? 'vehicle_owner' : 'business_quote';
    $('partner-modal-title').textContent = owner ? 'Faisons connaître votre véhicule' : 'Construisons votre offre entreprise';
    $('partner-modal-subtitle').textContent = owner
      ? 'Présentez-nous votre voiture : nous étudions son potentiel et vous expliquons simplement la suite.'
      : 'Décrivez votre projet de mobilité : nous revenons vers vous avec une solution adaptée à votre volume et votre trajet.';
    $('partner-modal-eyebrow').textContent = owner ? 'PARTENARIAT · VOTRE VÉHICULE' : 'B2B · SOLUTION SUR MESURE';
    $('partner-side-icon').className = owner ? 'fas fa-handshake' : 'fas fa-building';
    $('partner-side-title').innerHTML = owner ? 'Ensemble,<br><strong>allons plus loin</strong>' : 'Votre mobilité,<br><strong>notre priorité</strong>';
    $('partner-side-point-1').textContent = owner ? 'Accompagnement sur mesure' : 'Flotte adaptée à votre activité';
    $('partner-side-point-2').textContent = owner ? 'Réponse rapide' : 'Tarifs avantageux';
    $('partner-side-point-3').textContent = owner ? 'Solution adaptée à vos besoins' : 'Service professionnel';
    $('vehicle-owner-fields').classList.toggle('hidden', !owner);
    $('business-quote-fields').classList.toggle('hidden', owner);
    $('business-company-wrap').classList.toggle('hidden', owner);
    $('business-company').required = !owner;
    [...$('vehicle-owner-fields').querySelectorAll('input')].forEach(input => input.disabled = !owner);
    [...$('business-quote-fields').querySelectorAll('input')].forEach(input => input.disabled = owner);
  };
  const close = () => { modal.classList.add('hidden'); document.body.style.overflow = ''; };
  document.querySelectorAll('[data-partner-open]').forEach(button => button.addEventListener('click', () => { setMode(button.dataset.partnerOpen); form.reset(); setMode(button.dataset.partnerOpen); modal.classList.remove('hidden'); document.body.style.overflow = 'hidden'; }));
  document.querySelectorAll('[data-partner-close]').forEach(button => button.addEventListener('click', close));
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.classList.contains('hidden')) close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const result = $('partner-request-result'); const type = $('partner-request-type').value;
    const payload = { contact_name: $('partner-name').value.trim(), phone: $('partner-phone').value.trim(), email: $('partner-email').value.trim() || null, message: $('partner-message').value.trim() || null };
    if (type === 'vehicle_owner') Object.assign(payload, { make: $('partner-make').value.trim(), model: $('partner-model').value.trim(), seats: Number($('partner-seats').value), transmission: $('partner-transmission').value.trim(), fuel: $('partner-fuel').value.trim() });
    else Object.assign(payload, { company_name: $('business-company').value.trim(), car_type: $('business-car-type').value.trim(), seats: Number($('business-seats').value), vehicle_count: Number($('business-count').value), duration_days: Number($('business-days').value), route: $('business-route').value.trim() });
    const db = window.rentCarSupabase;
    if (!db) { result.textContent = 'Le service est temporairement indisponible. Contactez-nous par WhatsApp.'; return; }
    const button = form.querySelector('button[type="submit"]'); button.disabled = true; result.textContent = 'Envoi en cours…';
    try {
      const saved = await db.from('partner_requests').insert({ request_type: type, payload }).select('id').single();
      if (saved.error) throw saved.error;
      result.className = 'booking-result booking-success'; result.innerHTML = `Merci. Votre demande a été enregistrée sous la référence <strong>${esc(saved.data.id.slice(0, 8).toUpperCase())}</strong>. Nous vous recontacterons rapidement.`;
      form.reset(); setMode(type);
    } catch (error) { result.className = 'booking-result booking-error'; result.textContent = `Impossible d’enregistrer la demande : ${error.message || 'réessayez plus tard.'}`; }
    finally { button.disabled = false; }
  });
})();
