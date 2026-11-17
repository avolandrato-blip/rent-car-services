(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const dateInTana = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Antananarivo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value ? new Date(value) : new Date());
  const contractEndBefore = (date, days = 1) => {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - days);
    return value.toISOString().slice(0, 10);
  };
  const canAccessPartnerPage = (profile, today = dateInTana()) => Boolean(profile && profile.role === 'partner' && profile.is_active === true && (!profile.access_ends_on || profile.access_ends_on >= today));
  const reservationPaid = (reservation, payments = []) => Math.max(Number(reservation?.deposit_amount || 0), payments.filter(payment => payment.reservation_id === reservation?.id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const normalizePartnerLogin = value => {
    let name = String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    name = name.replace(/^p[_\s-]+/i, '').replace(/[^a-zA-Z0-9]+/g, '.').replace(/^\.+|\.+$/g, '').toLowerCase();
    return name;
  };
  const partnerAuthEmail = login => `${login.toLowerCase()}@partner.rent-car-service.local`;
  const helpers = { esc, dateInTana, contractEndBefore, canAccessPartnerPage, reservationPaid, normalizePartnerLogin, partnerAuthEmail };
  if (typeof module !== 'undefined' && module.exports) module.exports = helpers;
  if (typeof document === 'undefined') return;

  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const state = { user: null, profile: null, vehicles: [], reservations: [], maintenances: [], payments: [], tab: 'overview', busy: false };
  const statuses = { pre_reserved: 'En attente', reserved: 'Confirmée', completed: 'Terminée', cancelled: 'Annulée', available: 'Disponible', maintenance: 'En maintenance', inactive: 'Inactive', contract_ended: 'Fin de contrat' };
  const money = value => `${Math.round(Number(value || 0)).toLocaleString('fr-FR')} Ar`;
  const dateTime = value => value ? new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const dateOnly = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '—';
  const todayTana = () => dateInTana(new Date());
  const getExpiryDefault = () => state.profile?.access_ends_on ? contractEndBefore(state.profile.access_ends_on, 1) : '';
  const setMessage = (text = '', kind = 'info') => {
    const element = $('app-message');
    if (!element) return;
    element.textContent = text;
    element.className = `notice${kind === 'error' ? ' error' : kind === 'warn' ? ' warn' : ''}`;
    element.hidden = !text;
  };
  const setLoginMessage = (text = '', isError = false) => {
    const element = $('login-message');
    if (!element) return;
    element.textContent = text;
    element.className = `notice status-line${isError ? ' error' : ''}`;
    element.hidden = !text;
  };
  const ownerCanAddVehicle = () => Boolean(state.profile?.access_ends_on && getExpiryDefault() >= todayTana());

  function showLogin(message = '', isError = false) {
    $('app-view')?.classList.add('hidden');
    $('password-change-view')?.classList.add('hidden');
    $('login-view')?.classList.remove('hidden');
    setLoginMessage(message, isError);
  }

  function showPasswordChange(message = '', isError = false) {
    $('login-view')?.classList.add('hidden');
    $('app-view')?.classList.add('hidden');
    $('password-change-view')?.classList.remove('hidden');
    const element = $('password-change-message');
    element.textContent = message;
    element.className = `notice status-line${isError ? ' error' : ''}`;
    element.hidden = !message;
  }

  function showApp() {
    $('login-view')?.classList.add('hidden');
    $('password-change-view')?.classList.add('hidden');
    $('app-view')?.classList.remove('hidden');
    const accountLabel = state.profile?.business_name || state.profile?.display_name || state.profile?.email || 'Partenaire';
    $('profile-chip').textContent = accountLabel;
    $('profile-expiry').textContent = state.profile?.access_ends_on ? `Accès valable jusqu’au ${dateOnly(state.profile.access_ends_on)} à 23 h 59 (heure de Madagascar)` : 'Accès sans date de fin';
    const endDefault = getExpiryDefault();
    $('vehicle-form-toggle').disabled = !ownerCanAddVehicle();
    $('vehicle-form-message').hidden = ownerCanAddVehicle();
    $('vehicle-form-message').textContent = ownerCanAddVehicle() ? '' : 'Votre date de fin de contrat ne permet pas d’ajouter une voiture. Contactez le super-admin.';
    if (endDefault) $('vehicle-form').dataset.contractEndDefault = endDefault;
  }

  async function loadProfile(user) {
    const { data, error } = await db.from('account_profiles').select('user_id,role,email,display_name,business_name,is_active,access_ends_on,login_name,must_change_password').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!canAccessPartnerPage(data)) {
      await db.auth.signOut();
      state.user = null;
      state.profile = null;
      showLogin('Ce compte n’a pas un accès partenaire actif. Contactez l’administrateur si vous pensez qu’il s’agit d’une erreur.', true);
      return false;
    }
    state.user = user;
    state.profile = data;
    if (data.must_change_password === true) {
      showPasswordChange();
      return true;
    }
    showApp();
    return true;
  }

  async function verifySession() {
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    if (!data.session?.user) { showLogin(); return false; }
    return loadProfile(data.session.user);
  }

  async function signIn(event) {
    event.preventDefault();
    const button = $('login-submit');
    button.disabled = true;
    setLoginMessage('Connexion…');
    try {
      const login = normalizePartnerLogin($('login-name').value);
      if (!login || login.length < 2) throw new Error('Saisissez le prénom utilisé comme identifiant.');
      const { data, error } = await db.auth.signInWithPassword({ email: partnerAuthEmail(login), password: $('login-password').value });
      if (error) throw error;
      const allowed = await loadProfile(data.user);
      if (!allowed) return;
      setLoginMessage();
      if (state.profile?.must_change_password === true) return;
      await refreshAll();
    } catch (error) {
      setLoginMessage(`Connexion impossible : ${error?.message || error}`, true);
    } finally { button.disabled = false; }
  }

  async function changeInitialPassword(event) {
    event.preventDefault();
    const temporaryPassword = $('temporary-password').value;
    const password = $('new-password').value;
    const confirmation = $('confirm-password').value;
    if (!temporaryPassword) return showPasswordChange('Saisissez le mot de passe temporaire remis par le super-admin.', true);
    if (password.length < 12) return showPasswordChange('Le nouveau mot de passe doit comporter au moins 12 caractères.', true);
    if (password !== confirmation) return showPasswordChange('Les deux mots de passe ne correspondent pas.', true);
    if (password === temporaryPassword) return showPasswordChange('Le nouveau mot de passe doit être différent du mot de passe temporaire.', true);
    const button = $('password-change-submit');
    button.disabled = true;
    showPasswordChange('Enregistrement sécurisé du mot de passe…');
    try {
      const { data, error } = await db.functions.invoke('manage-partner-account', {
        body: { action: 'complete_first_login', temporary_password: temporaryPassword, new_password: password },
      });
      if (error || data?.ok !== true) throw error || new Error(data?.error || 'La première connexion n’a pas pu être validée. Réessayez.');
      const loginName = state.profile?.login_name;
      await db.auth.signOut();
      const { data: signedIn, error: signInError } = await db.auth.signInWithPassword({
        email: partnerAuthEmail(loginName), password,
      });
      if (signInError || !signedIn?.user) throw signInError || new Error('Mot de passe mis à jour. Reconnectez-vous avec votre nouveau mot de passe.');
      const allowed = await loadProfile(signedIn.user);
      if (!allowed || state.profile?.must_change_password === true) throw new Error('Le compte doit encore valider son changement de mot de passe.');
      $('password-change-form').reset();
      await refreshAll();
    } catch (error) {
      showPasswordChange(`Impossible de terminer la première connexion : ${error?.message || error}`, true);
    } finally { button.disabled = false; }
  }

  async function signOut() {
    await db.auth.signOut();
    state.user = null; state.profile = null; state.vehicles = []; state.reservations = []; state.payments = []; state.maintenances = [];
    showLogin('Vous êtes déconnecté.');
  }

  async function fetchOwnedData() {
    const [vehicleResult, reservationResult, maintenanceResult] = await Promise.all([
      db.from('vehicles').select('id,uid,name,slug,make,model,registration_number,description,price_per_day,price_12h,price_24h,driver_mode,driver_fee,extra_driver_fee,transmission,fuel,seats,status,image_urls,fleet_group,contract_start_date,contract_end_date,created_at').order('created_at', { ascending: false }).limit(500),
      db.from('reservations').select('id,reference,vehicle_id,customer_name,customer_phone,start_at,end_at,days,total_amount,deposit_amount,payment_status,status,with_driver,trip_from,trip_to,created_at').order('created_at', { ascending: false }).limit(1000),
      db.from('maintenance').select('id,vehicle_id,start_at,end_at,reason,maintenance_type').order('start_at', { ascending: false }).limit(500),
    ]);
    if (vehicleResult.error) throw new Error(`Chargement des voitures impossible : ${vehicleResult.error.message}`);
    if (reservationResult.error) throw new Error(`Chargement des réservations impossible : ${reservationResult.error.message}`);
    if (maintenanceResult.error) throw new Error(`Chargement du calendrier impossible : ${maintenanceResult.error.message}`);
    state.vehicles = vehicleResult.data || [];
    state.reservations = reservationResult.data || [];
    state.maintenances = maintenanceResult.data || [];
    const ids = state.reservations.map(row => row.id);
    state.payments = [];
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      const { data, error } = await db.from('payments').select('reservation_id,amount,paid_at').in('reservation_id', chunk).limit(1000);
      if (error) throw new Error(`Chargement des paiements impossible : ${error.message}`);
      state.payments.push(...(data || []));
    }
  }

  function relatedReservations() {
    const ids = new Set(state.vehicles.map(vehicle => vehicle.id));
    return state.reservations.filter(row => ids.has(row.vehicle_id));
  }

  function updateMetrics() {
    const bookings = relatedReservations();
    const reportable = bookings.filter(row => ['reserved', 'completed'].includes(row.status));
    const revenue = reportable.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const collected = reportable.reduce((sum, row) => sum + reservationPaid(row, state.payments), 0);
    const incomplete = reportable.filter(row => reservationPaid(row, state.payments) < Number(row.total_amount || 0));
    $('metric-vehicles').textContent = String(state.vehicles.filter(vehicle => vehicle.status !== 'contract_ended').length);
    $('metric-bookings').textContent = String(reportable.length);
    $('metric-revenue').textContent = money(revenue);
    $('metric-collected').textContent = money(collected);
    $('metric-unpaid').textContent = String(incomplete.length);
  }

  function vehicleLabel(vehicle) {
    const base = vehicle.name || [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Voiture';
    const identifier = vehicle.uid != null ? ` · UID-${String(vehicle.uid).padStart(6, '0')}` : '';
    return `${base}${identifier}`;
  }

  function partnerFleetGroup(value) {
    const label = String(value || '').trim();
    return label ? `partner:${state.user.id}:${label}` : null;
  }

  function visibleFleetGroup(value) {
    const prefix = `partner:${state.user?.id}:`;
    return String(value || '').startsWith(prefix) ? String(value).slice(prefix.length) : (value || '');
  }

  function statusPill(status) {
    return `<span class="pill ${esc(status)}">${esc(statuses[status] || status || '—')}</span>`;
  }

  function renderVehicles() {
    const host = $('vehicles-table');
    const rows = state.vehicles.slice().sort((a, b) => vehicleLabel(a).localeCompare(vehicleLabel(b), 'fr'));
    $('vehicle-count').textContent = `${rows.length} voiture(s)`;
    host.innerHTML = rows.length ? `<table class="table"><thead><tr><th>Voiture</th><th>Location</th><th>État</th><th>Fin de contrat</th><th></th></tr></thead><tbody>${rows.map(vehicle => `<tr><td><strong>${esc(vehicleLabel(vehicle))}</strong><br><small>${esc([vehicle.transmission, vehicle.fuel, vehicle.seats ? `${vehicle.seats} places` : ''].filter(Boolean).join(' · ') || 'Caractéristiques non renseignées')}</small></td><td>12 h : ${money(vehicle.price_12h)}<br>24 h : ${vehicle.price_24h == null || vehicle.price_24h === '' ? 'Sur devis' : money(vehicle.price_24h)}</td><td>${statusPill(vehicle.status)}</td><td>${dateOnly(vehicle.contract_end_date)}</td><td>${vehicle.status === 'contract_ended' ? '—' : `<button class="btn outline" type="button" data-edit-vehicle="${esc(vehicle.id)}">Modifier</button>`}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune voiture ne vous est encore attribuée.</div>';
    $('recent-vehicles').innerHTML = rows.length ? `<table class="table"><tbody>${rows.slice(0, 5).map(vehicle => `<tr><td><strong>${esc(vehicleLabel(vehicle))}</strong><br><small>${esc(statuses[vehicle.status] || vehicle.status)}</small></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune voiture enregistrée.</div>';
    const select = $('calendar-vehicle');
    const previous = select.value;
    select.innerHTML = '<option value="all">Toutes mes voitures</option>' + rows.map(vehicle => `<option value="${esc(vehicle.id)}">${esc(vehicleLabel(vehicle))}</option>`).join('');
    if ([...select.options].some(option => option.value === previous)) select.value = previous;
  }

  function filteredBookings() {
    const filter = $('reservation-filter')?.value || 'all';
    const rows = relatedReservations();
    return rows.filter(row => filter === 'all' || row.status === filter).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  function renderReservations() {
    const vehicleById = new Map(state.vehicles.map(vehicle => [vehicle.id, vehicle]));
    const rows = filteredBookings();
    $('reservations-table').innerHTML = rows.length ? `<table class="table"><thead><tr><th>Référence / véhicule</th><th>Client</th><th>Période</th><th>Total / payé / solde</th><th>Statut / actions</th><th>Documents</th></tr></thead><tbody>${rows.map(row => {
      const paid = reservationPaid(row, state.payments), total = Number(row.total_amount || 0), balance = Math.max(0, total - paid), vehicle = vehicleById.get(row.vehicle_id);
      return `<tr><td><strong>${esc(row.reference)}</strong><br><small>${esc(vehicle ? vehicleLabel(vehicle) : 'Voiture')}</small></td><td>${esc(row.customer_name)}<br><a href="tel:${esc(String(row.customer_phone || '').replace(/[^+\d]/g, ''))}">${esc(row.customer_phone || '')}</a></td><td>${dateTime(row.start_at)}<br>→ ${dateTime(row.end_at)}</td><td>${money(total)}<br><small>Payé : ${money(paid)} · Solde : ${money(balance)}</small></td><td>${statusPill(row.status)}<div class="actions" style="margin-top:6px">${row.status === 'pre_reserved' ? `<button type="button" class="btn primary" data-partner-booking-action="accept" data-id="${esc(row.id)}">Accepter</button><button type="button" class="btn danger" data-partner-booking-action="reject" data-id="${esc(row.id)}">Refuser</button>` : row.status === 'reserved' ? `<button type="button" class="btn outline" data-partner-booking-action="cancel" data-id="${esc(row.id)}">Annuler</button><button type="button" class="btn outline" data-partner-booking-action="complete" data-id="${esc(row.id)}">Terminer</button>` : ''}<button type="button" class="btn outline" data-partner-booking-action="edit" data-id="${esc(row.id)}">Modifier</button></div></td><td><button type="button" class="btn outline" data-partner-booking-action="contract" data-id="${esc(row.id)}">Imprimer le contrat</button></td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty">Aucune réservation ne correspond à ce filtre.</div>';
    const recent = relatedReservations().slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
    $('recent-reservations').innerHTML = recent.length ? `<table class="table"><thead><tr><th>Demande</th><th>Période</th><th>Statut</th></tr></thead><tbody>${recent.map(row => `<tr><td><strong>${esc(row.reference)}</strong><br><small>${esc(row.customer_name)}</small></td><td>${dateTime(row.start_at)}</td><td>${statusPill(row.status)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune demande de réservation.</div>';
  }

  function renderCalendar() {
    const host = $('calendar-view');
    const month = $('calendar-month').value || todayTana().slice(0, 7);
    const [year, monthNumber] = month.split('-').map(Number);
    const first = new Date(year, monthNumber - 1, 1);
    if (Number.isNaN(first.getTime())) return;
    const days = new Date(year, monthNumber, 0).getDate();
    const selectedId = $('calendar-vehicle').value || 'all';
    const vehicles = state.vehicles.filter(vehicle => selectedId === 'all' || vehicle.id === selectedId);
    const monthStart = new Date(year, monthNumber - 1, 1);
    const monthEnd = new Date(year, monthNumber, 1);
    const weekdayOffset = (first.getDay() + 6) % 7;
    const headings = ['Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.', 'Dim.'].map(day => `<div class="calendar-heading">${day}</div>`).join('');
    const cards = Array.from({ length: weekdayOffset }, () => '<div class="calendar-day other"></div>');
    for (let day = 1; day <= days; day += 1) {
      const dayStart = new Date(year, monthNumber - 1, day), dayEnd = new Date(year, monthNumber - 1, day + 1);
      const events = [];
      vehicles.forEach(vehicle => {
        const reservations = state.reservations.filter(row => row.vehicle_id === vehicle.id && !['cancelled'].includes(row.status) && new Date(row.start_at) < dayEnd && new Date(row.end_at) > dayStart);
        const maintenance = state.maintenances.filter(row => row.vehicle_id === vehicle.id && new Date(row.start_at) < dayEnd && new Date(row.end_at) > dayStart);
        reservations.forEach(row => events.push(`<span class="calendar-event ${row.status === 'pre_reserved' ? 'pending' : ''}" title="${esc(`${vehicleLabel(vehicle)} · ${row.reference} · ${row.customer_name}`)}">${esc(vehicleLabel(vehicle))} · ${esc(row.reference)}</span>`));
        maintenance.forEach(row => events.push(`<span class="calendar-event maintenance" title="${esc(row.reason || 'Maintenance')}">${esc(vehicleLabel(vehicle))} · ${esc(row.reason || 'Blocage')} <button type="button" aria-label="Supprimer le blocage" data-partner-remove-block="${esc(row.id)}">×</button></span>`));
      });
      cards.push(`<div class="calendar-day"><strong>${day}</strong>${events.join('')}</div>`);
    }
    const trailing = (7 - cards.length % 7) % 7;
    for (let i = 0; i < trailing; i += 1) cards.push('<div class="calendar-day other"></div>');
    host.innerHTML = vehicles.length ? `<div class="calendar-grid">${headings}${cards.join('')}</div>` : '<div class="empty">Aucune voiture à afficher.</div>';
  }

  function renderAll() {
    updateMetrics(); renderVehicles(); renderReservations(); renderCalendar();
  }

  async function refreshAll() {
    if (state.busy) return;
    state.busy = true;
    $('refresh-button').disabled = true;
    setMessage('Actualisation des données…');
    try {
      if (!state.user || !canAccessPartnerPage(state.profile)) {
        const ok = await verifySession();
        if (!ok) return;
      }
      await fetchOwnedData();
      renderAll();
      document.dispatchEvent(new CustomEvent('rentcar:partner-refreshed', { detail: { vehicles: state.vehicles, reservations: relatedReservations(), profile: state.profile } }));
      setMessage(`Données actualisées à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`);
    } catch (error) {
      setMessage(error?.message || 'Erreur pendant le chargement des données.', 'error');
    } finally {
      state.busy = false;
      $('refresh-button').disabled = false;
    }
  }

  function openTab(tab) {
    if (!['overview', 'vehicles', 'reservations', 'calendar'].includes(tab)) return;
    state.tab = tab;
    document.querySelectorAll('.nav [data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === tab));
    document.querySelectorAll('.page-tab').forEach(section => { section.hidden = section.id !== `tab-${tab}`; });
    $('page-title').textContent = ({ overview: 'Tableau de bord', vehicles: 'Mes voitures', reservations: 'Mes réservations', calendar: 'Mon calendrier' })[tab];
    if (tab === 'vehicles') $('vehicle-form-toggle').focus({ preventScroll: true });
  }

  function clearVehicleForm() {
    $('vehicle-form').reset();
    $('vehicle-id').value = '';
    $('vehicle-form').dataset.contractEndDefault = getExpiryDefault();
    $('vehicle-driver-fee').value = '30000';
    $('vehicle-photo-preview').innerHTML = '';
    $('vehicle-save').textContent = 'Enregistrer la voiture';
    $('vehicle-form-message').hidden = true;
  }

  function editVehicle(id) {
    const vehicle = state.vehicles.find(item => item.id === id);
    if (!vehicle) return;
    clearVehicleForm();
    $('vehicle-id').value = vehicle.id;
    $('vehicle-name').value = vehicle.name || '';
    $('vehicle-make').value = vehicle.make || '';
    $('vehicle-model').value = vehicle.model || '';
    $('vehicle-registration').value = vehicle.registration_number || '';
    $('vehicle-price-12h').value = vehicle.price_12h ?? '';
    $('vehicle-price-24h').value = vehicle.price_24h ?? '';
    $('vehicle-price-day').value = vehicle.price_per_day ?? '';
    $('vehicle-driver-mode').value = vehicle.driver_mode || 'without_driver';
    $('vehicle-transmission').value = vehicle.transmission || '';
    $('vehicle-fuel').value = vehicle.fuel || '';
    $('vehicle-seats').value = vehicle.seats ?? '';
    $('vehicle-driver-fee').value = vehicle.driver_fee ?? 30000;
    $('vehicle-fleet-group').value = visibleFleetGroup(vehicle.fleet_group);
    $('vehicle-status').value = vehicle.status || 'available';
    $('vehicle-30-100').value = vehicle.price_30_100_per_day ?? '';
    $('vehicle-100-200').value = vehicle.price_100_200_per_day ?? '';
    $('vehicle-over-200').value = vehicle.price_over_200_per_day ?? '';
    $('vehicle-province-under-mode').value = vehicle.province_under_150_mode || 'quote';
    $('vehicle-province-under-price').value = vehicle.province_under_150_price ?? '';
    $('vehicle-province-over-mode').value = vehicle.province_over_150_mode || 'quote';
    $('vehicle-province-over-price').value = vehicle.province_over_150_price ?? '';
    $('vehicle-description').value = vehicle.description || '';
    $('vehicle-photo-preview').innerHTML = (vehicle.image_urls || []).map(url => `<img src="${esc(url)}" alt="Photo de ${esc(vehicleLabel(vehicle))}">`).join('');
    $('vehicle-form').hidden = false;
    $('vehicle-form-toggle').textContent = 'Fermer le formulaire';
    $('vehicle-save').textContent = 'Enregistrer les changements';
    $('vehicle-name').focus();
  }

  function makeSlug(value) {
    return String(value || 'voiture').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90) || 'voiture';
  }

  function uniqueSlug(value, currentId = null) {
    const used = new Set(state.vehicles.filter(vehicle => vehicle.id !== currentId).map(vehicle => String(vehicle.slug || '').toLowerCase()));
    const base = makeSlug(value);
    let candidate = base, suffix = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base}-${suffix++}`;
    return candidate;
  }

  async function uploadPhotos(vehicleId, selectedFiles, existingUrls = []) {
    if (!selectedFiles.length) return existingUrls;
    const urls = [...existingUrls];
    for (const file of selectedFiles) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`Format photo non pris en charge : ${file.name}`);
      if (file.size > 5 * 1024 * 1024) throw new Error(`La photo ${file.name} dépasse 5 Mo.`);
      const safeBase = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-100) || 'photo';
      const path = `${vehicleId}/${crypto.randomUUID()}-${safeBase}`;
      const { error } = await db.storage.from('vehicle-images').upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data } = db.storage.from('vehicle-images').getPublicUrl(path);
      if (data?.publicUrl) urls.push(data.publicUrl);
    }
    return urls;
  }

  async function saveVehicle(event) {
    event.preventDefault();
    if (!ownerCanAddVehicle() && !$('vehicle-id').value) {
      setVehicleMessage('Impossible d’ajouter une voiture : vérifiez la date de fin de votre contrat avec l’administrateur.', true); return;
    }
    const button = $('vehicle-save'); button.disabled = true;
    setVehicleMessage('Enregistrement…');
    const id = $('vehicle-id').value || null;
    const existingVehicle = id ? state.vehicles.find(vehicle => vehicle.id === id) : null;
    const payload = {
      name: $('vehicle-name').value.trim(),
      slug: existingVehicle?.slug || uniqueSlug($('vehicle-name').value, id),
      make: $('vehicle-make').value.trim() || null,
      model: $('vehicle-model').value.trim() || null,
      registration_number: $('vehicle-registration').value.trim() || null,
      price_12h: Number($('vehicle-price-12h').value),
      price_24h: $('vehicle-price-24h').value.trim() === '' ? null : Number($('vehicle-price-24h').value),
      price_per_day: $('vehicle-price-day').value.trim() === '' ? (Number($('vehicle-price-24h').value) || 0) : Number($('vehicle-price-day').value),
      driver_mode: $('vehicle-driver-mode').value,
      driver_fee: Number($('vehicle-driver-fee').value || 0),
      extra_driver_fee: Number($('vehicle-driver-fee').value || 0),
      transmission: $('vehicle-transmission').value.trim() || null,
      fuel: $('vehicle-fuel').value.trim() || null,
      seats: $('vehicle-seats').value ? Number($('vehicle-seats').value) : null,
      fleet_group: partnerFleetGroup($('vehicle-fleet-group').value),
      status: $('vehicle-status').value,
      description: $('vehicle-description').value.trim() || null,
      price_30_100_per_day: $('vehicle-30-100').value.trim() === '' ? null : Number($('vehicle-30-100').value),
      price_100_200_per_day: $('vehicle-100-200').value.trim() === '' ? null : Number($('vehicle-100-200').value),
      price_over_200_per_day: $('vehicle-over-200').value.trim() === '' ? null : Number($('vehicle-over-200').value),
      province_under_150_mode: $('vehicle-province-under-mode').value,
      province_under_150_price: $('vehicle-province-under-price').value.trim() === '' ? null : Number($('vehicle-province-under-price').value),
      province_over_150_mode: $('vehicle-province-over-mode').value,
      province_over_150_price: $('vehicle-province-over-price').value.trim() === '' ? null : Number($('vehicle-province-over-price').value),
      ...(id ? {} : { owner_user_id: state.user.id, contract_start_date: todayTana(), contract_end_date: getExpiryDefault() }),
    };
    if (!payload.name || !Number.isFinite(payload.price_12h) || payload.price_12h <= 0 || (payload.price_24h != null && (!Number.isFinite(payload.price_24h) || payload.price_24h <= 0))) {
      setVehicleMessage('Vérifiez le nom et les tarifs saisis. Le tarif 12 h doit être positif.', true); button.disabled = false; return;
    }
    try {
      let result;
      if (id) result = await db.from('vehicles').update(payload).eq('id', id).select('id,image_urls').single();
      else result = await db.from('vehicles').insert(payload).select('id,image_urls').single();
      if (result.error) throw result.error;
      const files = [...$('vehicle-photos').files];
      if (files.length) {
        const urls = await uploadPhotos(result.data.id, files, result.data.image_urls || []);
        const update = await db.from('vehicles').update({ image_urls: urls }).eq('id', result.data.id);
        if (update.error) throw update.error;
      }
      clearVehicleForm();
      $('vehicle-form').hidden = true;
      $('vehicle-form-toggle').textContent = 'Nouvelle voiture';
      await refreshAll();
      setMessage('Voiture enregistrée.');
    } catch (error) {
      setVehicleMessage(`Enregistrement impossible : ${error?.message || error}`, true);
    } finally { button.disabled = false; }
  }

  function setVehicleMessage(text, isError = false) {
    const el = $('vehicle-form-message');
    el.textContent = text; el.className = `notice field full${isError ? ' error' : ''}`; el.hidden = false;
  }

  function initialize() {
    if (!db) { showLogin('Configuration Supabase introuvable.', true); return; }
    $('login-form').addEventListener('submit', signIn);
    $('password-change-form').addEventListener('submit', changeInitialPassword);
    $('logout-button').addEventListener('click', signOut);
    $('refresh-button').addEventListener('click', refreshAll);
    $('calendar-refresh').addEventListener('click', refreshAll);
    $('reservation-filter').addEventListener('change', renderReservations);
    $('calendar-month').value = todayTana().slice(0, 7);
    $('calendar-month').addEventListener('change', renderCalendar);
    $('calendar-vehicle').addEventListener('change', renderCalendar);
    document.querySelectorAll('.nav [data-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.tab)));
    document.querySelectorAll('[data-open-tab]').forEach(button => button.addEventListener('click', () => openTab(button.dataset.openTab)));
    $('vehicle-form-toggle').addEventListener('click', () => {
      const form = $('vehicle-form');
      if (form.hidden) { clearVehicleForm(); form.hidden = false; $('vehicle-form-toggle').textContent = 'Fermer le formulaire'; }
      else { form.hidden = true; $('vehicle-form-toggle').textContent = 'Nouvelle voiture'; }
    });
    $('vehicle-cancel').addEventListener('click', () => { clearVehicleForm(); $('vehicle-form').hidden = true; $('vehicle-form-toggle').textContent = 'Nouvelle voiture'; });
    $('vehicle-form').addEventListener('submit', saveVehicle);
    $('vehicles-table').addEventListener('click', event => { const button = event.target.closest('[data-edit-vehicle]'); if (button) editVehicle(button.dataset.editVehicle); });
    $('vehicle-photos').addEventListener('change', () => {
      const files = [...$('vehicle-photos').files];
      $('vehicle-photo-preview').innerHTML = files.map(file => `<span class="help">${esc(file.name)}</span>`).join('');
    });
    db.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { state.user = null; state.profile = null; showLogin(); }
      if (event === 'TOKEN_REFRESHED' && session?.user) loadProfile(session.user).catch(error => showLogin(error.message, true));
    });
    verifySession().then(ok => { if (ok && state.profile?.must_change_password !== true) refreshAll(); }).catch(error => showLogin(`Vérification du compte impossible : ${error?.message || error}`, true));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
