(() => {
  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => `${Number(value || 0).toLocaleString('fr-FR')} Ar`;
  const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 40) || 'chauffeur';
  const state = { driver: null, missions: [], selected: null, reservations: new Map(), vehicles: new Map(), payments: new Map(), drawing: false, hasInk: false };

  const formatDate = value => value ? new Date(value).toLocaleString('fr-FR', {dateStyle:'short', timeStyle:'short'}) : '—';
  const typeLabel = type => ({delivery:'Livraison', recovery:'Récupération', delivery_and_recovery:'Livraison et récupération'}[type] || type);
  const statusLabel = status => ({assigned:'Attribuée', in_progress:'En cours', completed:'Terminée', cancelled:'Annulée', expired:'Expirée'}[status] || status);
  const currentUser = async () => (await db.auth.getUser()).data.user;

  async function login(event) {
    event.preventDefault();
    const loginName = slug($('team-login-name').value);
    const password = $('team-login-password').value;
    const error = $('team-login-error'); error.textContent = '';
    const button = event.currentTarget.querySelector('button[type="submit"]'); if (button) button.disabled = true;
    try {
      const { error: authError } = await db.auth.signInWithPassword({email: `${loginName}@team.rent-car-service.local`, password});
      if (authError) throw authError;
      await boot();
    } catch (err) {
      error.textContent = String(err?.message || '').includes('Invalid login credentials') ? 'Identifiant ou mot de passe incorrect.' : `Connexion impossible : ${err?.message || err}`;
    } finally { if (button) button.disabled = false; }
  }

  async function boot() {
    const user = await currentUser();
    if (!user) return;
    const { data: driver, error } = await db.from('chauffeurs').select('*').eq('auth_user_id', user.id).limit(1).maybeSingle();
    if (error || !driver) { await db.auth.signOut(); throw new Error('Ce compte n’est pas associé à un chauffeur actif.'); }
    state.driver = driver;
    $('team-login').classList.add('hidden'); $('team-app').classList.remove('hidden');
    $('team-driver-name').textContent = ` · ${driver.name || driver.login_name || 'Chauffeur'}`;
    if (driver.must_change_password) $('password-modal').classList.remove('hidden');
    await loadMissions();
  }

  async function loadMissions() {
    const { data: missions, error } = await db.from('chauffeur_missions').select('*').eq('chauffeur_id', state.driver.id).order('starts_at', {ascending:false});
    if (error) return showError(`Impossible de charger les missions : ${error.message}`);
    state.missions = missions || [];
    const reservationIds = [...new Set(state.missions.map(m => m.reservation_id))];
    state.reservations.clear(); state.vehicles.clear(); state.payments.clear();
    if (reservationIds.length) {
      const reservations = await db.from('reservations').select('*').in('id', reservationIds);
      (reservations.data || []).forEach(r => state.reservations.set(r.id, r));
      const vehicleIds = [...new Set((reservations.data || []).map(r => r.vehicle_id).filter(Boolean))];
      if (vehicleIds.length) {
        const vehicles = await db.from('vehicles').select('*').in('id', vehicleIds);
        (vehicles.data || []).forEach(v => state.vehicles.set(v.id, v));
      }
      const payments = await db.from('payments').select('*').in('reservation_id', reservationIds).order('paid_at', {ascending:true});
      (payments.data || []).forEach(p => { const list = state.payments.get(p.reservation_id) || []; list.push(p); state.payments.set(p.reservation_id, list); });
    }
    render();
  }

  const paidFor = reservationId => (state.payments.get(reservationId) || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const isSigned = reservationId => Boolean(state.reservations.get(reservationId)?.client_signature_present || false);
  const balanceFor = reservation => Math.max(0, Number(reservation?.total_amount || 0) - paidFor(reservation?.id));
  function showError(message) { const target = $('mission-detail'); if (target) target.innerHTML = `<p class="notice-error">${esc(message)}</p>`; }

  function render() {
    const now = Date.now();
    state.missions.forEach(m => { if (m.status === 'assigned' && new Date(m.expires_at).getTime() < now) m.status = 'expired'; });
    const active = state.missions.filter(m => ['assigned','in_progress'].includes(m.status));
    const completed = state.missions.filter(m => ['completed','expired','cancelled'].includes(m.status));
    $('metric-active').textContent = active.length;
    $('metric-completed').textContent = completed.filter(m => m.status === 'completed').length;
    $('metric-balance').textContent = money(active.reduce((sum, m) => sum + balanceFor(state.reservations.get(m.reservation_id)), 0));
    $('metric-signed').textContent = state.missions.filter(m => isSigned(m.reservation_id)).length;
    $('active-missions').innerHTML = active.length ? active.map(missionCard).join('') : '<div class="empty">Aucune mission active.</div>';
    $('completed-missions').innerHTML = completed.length ? completed.slice(0, 30).map(missionCard).join('') : '<div class="empty">Aucune mission terminée.</div>';
    document.querySelectorAll('[data-open-mission]').forEach(button => button.addEventListener('click', () => selectMission(button.dataset.openMission)));
    if (state.selected) selectMission(state.selected.id, false);
  }

  function missionCard(mission) {
    const r = state.reservations.get(mission.reservation_id) || {};
    const v = state.vehicles.get(r.vehicle_id) || {};
    return `<article class="mission-card ${mission.status === 'completed' ? 'completed' : ''}"><h3>${esc(typeLabel(mission.mission_type))} — ${esc(r.reference || 'Réservation')}</h3><div class="mission-meta"><span><b>Client :</b> ${esc(r.customer_name || '—')}</span><span><b>Véhicule :</b> ${esc(v.name || v.model || '—')}</span><span><b>Début :</b> ${formatDate(mission.starts_at)}</span><span><b>Expire :</b> ${formatDate(mission.expires_at)}</span></div><div class="mission-actions"><button class="btn outline" data-open-mission="${esc(mission.id)}">Voir la mission</button><span class="pill ${mission.status}">${esc(statusLabel(mission.status))}</span></div></article>`;
  }

  function selectMission(id, scroll = true) {
    state.selected = state.missions.find(m => m.id === id) || null;
    if (!state.selected) return;
    const m = state.selected, r = state.reservations.get(m.reservation_id) || {}, v = state.vehicles.get(r.vehicle_id) || {};
    const payments = state.payments.get(r.id) || [];
    const balance = balanceFor(r);
    $('mission-detail').innerHTML = `<h3>${esc(typeLabel(m.mission_type))} — ${esc(r.reference || 'Réservation')}</h3><p><b>Client :</b> ${esc(r.customer_name || '—')}<br><b>Téléphone :</b> ${esc(r.customer_phone || '—')}<br><b>Trajet :</b> ${esc(r.trip_from || '—')} → ${esc(r.trip_to || '—')}<br><b>Véhicule :</b> ${esc(v.name || v.model || '—')} ${v.registration_number ? `(${esc(v.registration_number)})` : ''}<br><b>Période :</b> ${formatDate(r.start_at)} → ${formatDate(r.end_at)}<br><b>Mission :</b> ${formatDate(m.starts_at)} → ${formatDate(m.expires_at)}</p><div class="finance"><div>Total réservation : <strong>${money(r.total_amount)}</strong></div><div>Total déjà payé : <strong>${money(paidFor(r.id))}</strong></div><div>Reste à payer : <strong>${money(balance)}</strong></div><div>Coût livraison personnalisé : <strong>${money(m.custom_delivery_cost)}</strong></div><div>Coût récupération personnalisé : <strong>${money(m.custom_recovery_cost)}</strong></div></div><div class="mission-actions">${m.status === 'assigned' ? '<button id="mission-start" class="btn primary">Démarrer la mission</button>' : ''}${['assigned','in_progress'].includes(m.status) ? '<button id="mission-payment" class="btn outline">Enregistrer un paiement</button><button id="mission-signature" class="btn outline">Faire signer le client</button><button id="mission-invoice" class="btn outline">Générer la facture</button><button id="mission-contract" class="btn outline">Générer le contrat</button>' : ''}${m.status === 'in_progress' ? '<button id="mission-complete" class="btn primary">Terminer la mission</button>' : ''}</div><h4>Historique des paiements</h4>${payments.length ? `<ul>${payments.map(p => `<li>${formatDate(p.paid_at)} — ${money(p.amount)} — ${esc(p.method || 'non précisé')} ${p.source === 'chauffeur' ? '(encaissé par vous)' : ''}</li>`).join('')}</ul>` : '<p class="muted">Aucun paiement enregistré.</p>'}<p class="muted">Signature client : ${isSigned(r.id) ? 'enregistrée' : 'non enregistrée'}</p>`;
    $('mission-start')?.addEventListener('click', () => updateMission({status:'in_progress', started_at:new Date().toISOString()}));
    $('mission-complete')?.addEventListener('click', () => updateMission({status:'completed', completed_at:new Date().toISOString()}));
    $('mission-payment')?.addEventListener('click', () => recordPayment(m));
    $('mission-signature')?.addEventListener('click', () => openSignature(m));
    $('mission-invoice')?.addEventListener('click', () => printMission(m, 'invoice'));
    $('mission-contract')?.addEventListener('click', () => printMission(m, 'contract'));
    if (scroll) $('mission-detail').scrollIntoView({behavior:'smooth', block:'start'});
  }

  async function updateMission(payload) {
    if (!state.selected) return;
    const { error } = await db.from('chauffeur_missions').update({...payload, updated_at:new Date().toISOString(), ...(payload.status === 'completed' ? {completed_by:(await currentUser())?.id || null} : {})}).eq('id', state.selected.id);
    if (error) return alert(`Mise à jour impossible : ${error.message}`);
    await loadMissions();
  }

  async function recordPayment(mission) {
    const r = state.reservations.get(mission.reservation_id); const max = balanceFor(r);
    const amount = Number(prompt(`Montant encaissé (reste attendu : ${money(max)})`, String(max)));
    if (!Number.isFinite(amount) || amount <= 0 || amount > max) return alert('Montant invalide.');
    const method = prompt('Mode de paiement (espèce, mobile money, autre)', 'espèce') || 'non précisé';
    const note = prompt('Remarque facultative', '') || null;
    const { error } = await db.from('payments').insert({reservation_id:r.id, amount, method, note, recorded_by_chauffeur_id:state.driver.id, source:'chauffeur'});
    if (error) return alert(`Paiement impossible : ${error.message}`);
    await loadMissions();
  }

  function printMission(mission, kind) {
    const r = {...(state.reservations.get(mission.reservation_id) || {})}; const v = {...(state.vehicles.get(r.vehicle_id) || {})};
    window.reservations = [r]; window.vehicles = [v]; window.paidFor = reservation => paidFor(reservation.id);
    if (typeof window.printDocument !== 'function') return alert('Générateur de documents indisponible.');
    window.printDocument(r.id, kind, '');
  }

  function setupCanvas() {
    const canvas = $('team-signature-canvas'); if (!canvas) return;
    const rect = canvas.getBoundingClientRect(); const ratio = Math.max(window.devicePixelRatio || 1, 1); canvas.width = rect.width * ratio; canvas.height = rect.height * ratio; const ctx = canvas.getContext('2d'); ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#102d46';
    const point = event => { const r = canvas.getBoundingClientRect(); return [event.clientX - r.left, event.clientY - r.top]; };
    canvas.onpointerdown = event => { state.drawing = true; state.hasInk = true; canvas.setPointerCapture(event.pointerId); const [x,y] = point(event); ctx.beginPath(); ctx.moveTo(x,y); };
    canvas.onpointermove = event => { if (!state.drawing) return; const [x,y] = point(event); ctx.lineTo(x,y); ctx.stroke(); };
    canvas.onpointerup = () => { state.drawing = false; };
    canvas.onpointercancel = () => { state.drawing = false; };
  }
  function openSignature(mission) { state.selected = mission; $('signature-client-label').textContent = `${state.reservations.get(mission.reservation_id)?.customer_name || 'Client'} — ${state.reservations.get(mission.reservation_id)?.customer_phone || ''}`; $('signature-message').textContent = ''; $('signature-modal').classList.remove('hidden'); requestAnimationFrame(setupCanvas); }
  function clearSignature() { const c = $('team-signature-canvas'); c.getContext('2d').clearRect(0,0,c.width,c.height); state.hasInk = false; }
  async function saveSignature() {
    if (!state.selected || !state.hasInk) return $('signature-message').textContent = 'La signature est vide.';
    const r = state.reservations.get(state.selected.reservation_id); const data = $('team-signature-canvas').toDataURL('image/png');
    const { data: saved, error } = await db.rpc('save_chauffeur_reservation_signature', {p_mission_id:state.selected.id, p_signature_data:data, p_signer_name:r.customer_name || '', p_signer_phone:r.customer_phone || ''});
    if (error || saved !== true) return $('signature-message').textContent = error?.message || 'Signature refusée ou mission expirée.';
    $('signature-modal').classList.add('hidden'); await loadMissions();
  }

  async function changePassword(event) { event.preventDefault(); const a = $('new-password').value, b = $('new-password-confirm').value; if (a.length < 8 || a !== b) return $('password-message').textContent = 'Les mots de passe doivent être identiques et contenir au moins 8 caractères.'; const {error} = await db.auth.updateUser({password:a}); if (error) return $('password-message').textContent = error.message; const {error:updateError} = await db.from('chauffeurs').update({must_change_password:false}).eq('id',state.driver.id); if (updateError) return $('password-message').textContent = updateError.message; $('password-modal').classList.add('hidden'); }
  async function logout() { await db.auth.signOut(); window.location.reload(); }

  document.addEventListener('DOMContentLoaded', async () => {
    $('team-login-form').addEventListener('submit', login); $('team-logout').addEventListener('click', logout); $('change-password-form').addEventListener('submit', changePassword); $('signature-clear').addEventListener('click', clearSignature); $('signature-cancel').addEventListener('click', () => $('signature-modal').classList.add('hidden')); $('signature-save').addEventListener('click', saveSignature);
    const {data} = await db.auth.getSession(); if (data.session) { try { await boot(); } catch (error) { $('team-login-error').textContent = error.message; } }
  });
})();
