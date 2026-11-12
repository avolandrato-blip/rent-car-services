(() => {
  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => `${Number(value || 0).toLocaleString('fr-FR')} Ar`;
  const state = { drivers: [], reservations: [], missions: [], payments: [], dues: [], pendingMission: null };
  const dateTime = value => value ? new Date(value).toLocaleString('fr-FR', {dateStyle:'short',timeStyle:'short'}) : '—';
  const isoFromLocal = value => value ? new Date(value).toISOString() : null;
  const statusLabel = status => ({assigned:'À accepter',accepted:'Mission acceptée',refused:'Mission refusée',in_progress:'En cours',completed:'Terminée',cancelled:'Annulée',expired:'Expirée'}[status] || status);
  const missionTypeLabel = type => ({delivery:'Livraison',recovery:'Récupération',delivery_and_recovery:'Livraison + récupération'}[type] || type);

  function addTab() {
    if ($('team-missions')) return;
    document.querySelector('.nav')?.insertAdjacentHTML('afterbegin', '<button class="nav-mission" data-tab="team-missions">🚗 Missions chauffeur</button>');
    $('chauffeurs')?.insertAdjacentHTML('afterend', `<section id="team-missions" class="tab"><div class="card"><div class="section-head"><div><h2>Missions chauffeur</h2><p class="muted">Une mission correspond à une livraison/récupération (24 h maximum). Une location longue reste une réservation unique; activez son échéancier quotidien ci-dessous.</p></div><button id="team-missions-refresh" class="btn outline" type="button">Actualiser</button></div><form id="team-mission-form" class="form-grid"><div class="field"><label for="team-mission-reservation">Réservation</label><select id="team-mission-reservation" required></select></div><div class="field"><label for="team-mission-driver">Chauffeur</label><select id="team-mission-driver" required></select><small id="team-mission-driver-help" class="muted"></small></div><div class="field"><label for="team-mission-type">Type de mission</label><select id="team-mission-type"><option value="delivery">Livraison</option><option value="recovery">Récupération</option><option value="delivery_and_recovery">Livraison et récupération</option></select></div><div class="field"><label for="team-mission-start">Début</label><input id="team-mission-start" type="datetime-local" required></div><div class="field"><label for="team-mission-end">Fin de la mission — 24 h maximum</label><input id="team-mission-end" type="datetime-local" required></div><div class="field"><label for="team-mission-address">Adresse de livraison / récupération</label><input id="team-mission-address" maxlength="300" placeholder="Adresse ou point de rendez-vous"></div><div class="field"><label for="team-mission-delivery-cost">Coût livraison personnalisé (Ar)</label><input id="team-mission-delivery-cost" type="number" min="0" step="1000" value="0"></div><div class="field"><label for="team-mission-recovery-cost">Coût récupération personnalisé (Ar)</label><input id="team-mission-recovery-cost" type="number" min="0" step="1000" value="0"></div><div class="field full"><label for="team-mission-notes">Note pour le chauffeur</label><textarea id="team-mission-notes" rows="2" maxlength="1000" placeholder="Consigne d’accès ou autre information"></textarea></div><div class="field full"><label for="team-mission-instructions">Consignes à vérifier</label><textarea id="team-mission-instructions" rows="2" maxlength="1000" placeholder="Ex. photo CIN, permis, contrat à générer…">Vérifier la CIN et le permis; générer le contrat si nécessaire.</textarea></div><div class="field full" style="padding:12px;border:1px solid #e4ebf1;border-radius:10px"><label style="display:flex;gap:8px;align-items:flex-start"><input id="team-daily-enabled" type="checkbox"> Activer un échéancier de paiement quotidien pour cette réservation</label><div id="team-daily-fields" class="form-grid hidden" style="margin-top:10px"><div class="field"><label for="team-daily-amount">Montant par jour (Ar)</label><input id="team-daily-amount" type="number" min="1" step="1000" disabled></div><p class="field muted" style="margin:0">Une échéance par jour de location sera créée. Les paiements sont enregistrés depuis les réservations avec leur date d’échéance; aucun nouveau dossier de mission quotidien n’est créé.</p></div><div id="team-daily-info" class="muted" style="margin-top:8px"></div></div><div class="field full"><button class="btn primary" type="submit">Attribuer la mission et préparer WhatsApp</button></div></form><p id="team-mission-message" class="notice" role="status" aria-live="polite" hidden></p><div id="team-credentials" class="notice" hidden></div><hr><h3>Comptes team</h3><div id="team-account-list" class="table-wrap"></div><hr><h3>Missions attribuées</h3><div id="team-missions-list" class="table-wrap"></div></div></section>`);
    document.querySelector('.nav button[data-tab="team-missions"]')?.addEventListener('click', event => {
      event.preventDefault();
      document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button === event.currentTarget));
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      $('team-missions').classList.add('active');
      const title = $('page-title'); if (title) title.textContent = 'Missions chauffeur';
      load();
    });
    const missionForm=$('team-mission-form'); missionForm.noValidate=true; missionForm.addEventListener('submit', createMission);
    $('team-missions-refresh').addEventListener('click', load);
    if (!$('team-mission-review-modal')) document.body.insertAdjacentHTML('beforeend', `<div id="team-mission-review-modal" class="team-mission-review-backdrop" hidden><section class="team-mission-review" role="dialog" aria-modal="true" aria-labelledby="team-mission-review-title"><header class="team-mission-review-header"><div class="team-mission-review-heading"><span class="team-review-kicker">MISSION À VALIDER</span><h2 id="team-mission-review-title">Récapitulatif de la mission</h2><p>Vérifiez les informations avant d’enregistrer la mission et d’ouvrir WhatsApp.</p></div><button id="team-mission-review-close" class="btn outline" type="button" aria-label="Fermer le récapitulatif">Fermer</button></header><div id="team-mission-review-content" class="team-mission-review-content"></div><div class="team-mission-review-actions"><button id="team-mission-review-cancel" class="btn outline" type="button">Modifier</button><button id="team-mission-review-confirm" class="btn primary" type="button">Confirmer et préparer WhatsApp</button></div><p id="team-mission-review-message" class="notice-error" role="alert"></p></section></div>`);
    $('team-mission-review-close').addEventListener('click', closeMissionReview);
    $('team-mission-review-cancel').addEventListener('click', closeMissionReview);
    $('team-mission-review-confirm').addEventListener('click', submitPendingMission);
    $('team-mission-driver').addEventListener('change', fillDriverRates);
    $('team-mission-reservation').addEventListener('change', fillReservationDefaults);
    $('team-daily-enabled').addEventListener('change', () => {
      const enabled=$('team-daily-enabled').checked;
      $('team-daily-fields').classList.toggle('hidden', !enabled);
      $('team-daily-amount').disabled=!enabled;
      if (enabled && !$('team-daily-amount').value) fillReservationDefaults();
      updateDailyInfo();
    });
    $('team-mission-start').addEventListener('change', () => {
      if (!$('team-mission-end').value) $('team-mission-end').value = plus24($('team-mission-start').value);
    });
  }

  const plus24 = local => { const d = new Date(local); d.setHours(d.getHours() + 24); return d.toISOString().slice(0,16); };
  const randomToken = () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, byte => byte.toString(16).padStart(2,'0')).join('');
  };
  async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2,'0')).join('');
  }
  function toWhatsAppNumber(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = `261${digits.slice(1)}`;
    return digits;
  }
  function dateInTana(value) {
    const parts = new Intl.DateTimeFormat('en', {timeZone:'Indian/Antananarivo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(value));
    const part = type => parts.find(item => item.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }
  function addCalendarDays(date, offset) {
    const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + offset);
    return value.toISOString().slice(0,10);
  }
  function rentalDayCount(reservation) {
    const startDate=dateInTana(reservation.start_at),endDate=dateInTana(reservation.end_at);
    const diffDays=Math.max(1,Math.ceil((Date.parse(`${endDate}T00:00:00Z`)-Date.parse(`${startDate}T00:00:00Z`))/86400000));
    return Math.min(730,Number(reservation.days)>0?Number(reservation.days):diffDays);
  }
  function fillDriverRates() {
    const d = state.drivers.find(x => x.id === $('team-mission-driver').value);
    if (!d) return;
    $('team-mission-delivery-cost').value = Number(d.delivery_rate || 0);
    $('team-mission-recovery-cost').value = Number(d.recovery_rate || 0);
  }
  function fillReservationDefaults() {
    const reservation = state.reservations.find(r => r.id === $('team-mission-reservation').value);
    if (!reservation) return;
    if (!$('team-mission-address').value.trim()) $('team-mission-address').value = reservation.customer_address || reservation.trip_from || reservation.trip_to || '';
    if (!$('team-daily-amount').value) {
      const dailyRate=Number(reservation.daily_rate||0);
      $('team-daily-amount').value=Number.isFinite(dailyRate)&&dailyRate>0?String(dailyRate):'';
    }
    $('team-daily-amount').disabled=!$('team-daily-enabled').checked;
    updateDailyInfo();
  }
  function updateDailyInfo() {
    const reservation = state.reservations.find(r => r.id === $('team-mission-reservation').value);
    const existing = state.dues.filter(due => due.reservation_id === reservation?.id);
    const info = $('team-daily-info');
    if (!info) return;
    if (existing.length) {
      const paidByDate = new Map();
      state.payments.filter(payment => payment.reservation_id === reservation.id && payment.due_date).forEach(payment => paidByDate.set(payment.due_date,(paidByDate.get(payment.due_date)||0)+Number(payment.amount||0)));
      const outstanding = existing.filter(due => (paidByDate.get(due.due_date)||0) < Number(due.due_amount)).length;
      info.textContent = `Échéancier déjà actif : ${existing.length} jour(s), ${outstanding} encore(s) à régler. Il ne sera pas écrasé par cette attribution.`;
    } else {
      info.textContent = $('team-daily-enabled').checked ? 'Un échéancier sera créé après l’attribution de la mission.' : '';
    }
  }
  function fillSelects() {
    const activeDrivers=state.drivers.filter(d=>d.active);
    const readyDrivers=activeDrivers.filter(d=>Boolean(d.auth_user_id&&String(d.login_name||'').trim()));
    $('team-mission-driver').innerHTML = readyDrivers.map(d => `<option value="${esc(d.id)}">${esc(d.name)} — ${esc(d.login_name)}</option>`).join('') || `<option value="">${activeDrivers.length ? 'Aucun chauffeur prêt : créez son compte team' : 'Aucun chauffeur actif'}</option>`;
    const driverHelp=$('team-mission-driver-help');
    if(driverHelp) driverHelp.textContent=activeDrivers.length ? `${readyDrivers.length} chauffeur(s) prêt(s) sur ${activeDrivers.length} actif(s). Créez un compte team pour les autres dans la section « Comptes team ».` : 'Ajoutez et activez un chauffeur avant de créer une mission.';
    const confirmedReservations=state.reservations.filter(r=>r.status==='reserved');
    $('team-mission-reservation').innerHTML = confirmedReservations.map(r => `<option value="${esc(r.id)}">${esc(r.reference)} — ${esc(r.customer_name)} — ${dateTime(r.start_at)}</option>`).join('') || '<option value="">Aucune réservation confirmée — confirmez-la d’abord</option>';
    fillDriverRates(); fillReservationDefaults();
  }
  async function load() {
    addTab();
    const [drivers, reservations, missions, payments, dues] = await Promise.all([
      db.from('chauffeurs').select('id,name,login_name,auth_user_id,active,delivery_rate,recovery_rate,phone,whatsapp').order('name'),
      db.from('reservations').select('id,reference,customer_name,customer_phone,customer_address,trip_from,trip_to,notes,start_at,end_at,days,daily_rate,status,total_amount,deposit_amount').order('start_at',{ascending:false}),
      db.from('chauffeur_missions').select('*,chauffeurs(name,login_name),reservations(reference,customer_name)').order('starts_at',{ascending:false}),
      db.from('payments').select('reservation_id,amount,due_date,paid_at,method').order('paid_at',{ascending:false}),
      db.from('reservation_daily_dues').select('reservation_id,due_date,due_amount').order('due_date')
    ]);
    if (drivers.error || reservations.error) return show(`Erreur de chargement : ${drivers.error?.message || reservations.error?.message}`);
    state.drivers=drivers.data||[]; state.reservations=reservations.data||[]; state.missions=missions.data||[]; state.payments=payments.data||[]; state.dues=dues.data||[];
    fillSelects(); renderAccounts(); renderMissions(); updateDailyInfo();
    if (dues.error) show(`Le schéma de l’échéancier n’est pas encore disponible. Appliquez la migration 20261110100000_chauffeur_mission_workflow.sql. Détail : ${dues.error.message}`);
    else if (missions.error) show(`Les comptes sont disponibles, mais la liste des missions est indisponible : ${missions.error.message}`);
  }
  function show(message, whatsappUrl = '') {
    const el = $('team-mission-message');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = `${esc(message)}${whatsappUrl ? ` <a class="btn primary" href="${esc(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Ouvrir WhatsApp et envoyer</a> <a class="btn outline" href="https://web.whatsapp.com/" target="_blank" rel="noopener noreferrer">Ouvrir WhatsApp Web</a><br><small>WhatsApp s’ouvre avec le message prérempli. Appuyez sur Envoyer dans WhatsApp pour le transmettre.</small>` : ''}`;
  }
  function renderAccounts() {
    $('team-account-list').innerHTML = state.drivers.map(d => `<div class="card"><strong>${esc(d.name)}</strong> — ${d.auth_user_id ? `login : <b>${esc(d.login_name || 'configuré')}</b>` : '<span class="muted">aucun compte team</span>'}<button class="btn outline" style="margin-left:10px" data-provision-driver="${esc(d.id)}">${d.auth_user_id ? 'Réinitialiser le mot de passe' : 'Créer le compte team'}</button></div>`).join('') || '<div class="empty">Aucun chauffeur.</div>';
    document.querySelectorAll('[data-provision-driver]').forEach(button => button.addEventListener('click', () => provision(button.dataset.provisionDriver, Boolean(state.drivers.find(d => d.id === button.dataset.provisionDriver)?.auth_user_id))));
  }
  function renderMissions() {
    $('team-missions-list').innerHTML = state.missions.length ? `<table class="table"><thead><tr><th>Réservation</th><th>Chauffeur</th><th>Type</th><th>Fenêtre</th><th>Coûts</th><th>Statut</th><th></th></tr></thead><tbody>${state.missions.map(m => `<tr><td><strong>${esc(m.reservations?.reference || '—')}</strong><br>${esc(m.reservations?.customer_name || '')}</td><td>${esc(m.chauffeurs?.name || '—')}</td><td>${esc(missionTypeLabel(m.mission_type))}</td><td>${dateTime(m.starts_at)}<br>→ ${dateTime(m.expires_at)}</td><td>Liv. ${money(m.custom_delivery_cost)}<br>Réc. ${money(m.custom_recovery_cost)}</td><td><span class="pill ${esc(m.status)}">${esc(statusLabel(m.status))}</span></td><td>${['assigned','accepted','in_progress'].includes(m.status) ? `<button class="btn danger" data-cancel-mission="${esc(m.id)}">Annuler</button>` : ''}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune mission attribuée.</div>';
    document.querySelectorAll('[data-cancel-mission]').forEach(button => button.addEventListener('click', () => cancelMission(button.dataset.cancelMission)));
  }
  async function provision(id, reset) {
    if (!confirm(reset ? 'Réinitialiser le mot de passe de ce chauffeur ?' : 'Créer le compte team de ce chauffeur ?')) return;
    try {
      const {data,error} = await db.functions.invoke('provision-chauffeur-account', {body:{chauffeur_id:id,reset_password:reset}});
      if (error) { const message=`Création du compte impossible : ${error.message || error}`; show(message); alert(message); return; }
      if (!data?.ok) { const message=data?.error || 'Le serveur n’a pas confirmé la création du compte.'; show(message); alert(message); return; }
      const credentials=$('team-credentials');
      const initialPassword=data.initial_password || 'compte déjà existant — utilisez « Réinitialiser le mot de passe »';
      if (credentials) { credentials.hidden=false; credentials.innerHTML=`<strong>Identifiants à remettre séparément au chauffeur</strong><br>Login : <code>${esc(data.login_name)}</code><br>Mot de passe initial : <code>${esc(initialPassword)}</code><br><small>Ne mettez pas le mot de passe dans le message WhatsApp de mission. Le chauffeur devra le remplacer à sa première connexion.</small>`; }
      show(data.message || 'Compte traité.'); alert(`Compte traité.\n\nLogin : ${data.login_name}\nMot de passe initial : ${initialPassword}\n\nRemettez le mot de passe séparément, pas dans WhatsApp.`); await load();
    } catch (error) { const message=`Erreur technique : ${error?.message || error}`; show(message); alert(message); }
  }
  function buildDailyDues(reservation, dailyAmount) {
    const startDate = dateInTana(reservation.start_at);
    const days = rentalDayCount(reservation);
    return Array.from({length:days}, (_, index) => ({reservation_id:reservation.id,due_date:addCalendarDays(startDate,index),due_amount:dailyAmount}));
  }
  function makeWhatsAppMessage(mission, reservation, driver, token, dailyPlanReady) {
    const phone=toWhatsAppNumber(driver.whatsapp || driver.phone);
    if (!phone) return {phone:'',url:''};
    const paid=Math.max(Number(reservation.deposit_amount||0),state.payments.filter(payment => payment.reservation_id===reservation.id).reduce((sum,payment)=>sum+Number(payment.amount||0),0));
    const balance=Math.max(0,Number(reservation.total_amount||0)-paid);
    const driverUrl=new URL('team.html',location.href).href;
    const acceptUrl=new URL('team-action.html',location.href); acceptUrl.searchParams.set('token',token); acceptUrl.searchParams.set('response','accept');
    const refuseUrl=new URL('team-action.html',location.href); refuseUrl.searchParams.set('token',token); refuseUrl.searchParams.set('response','refuse');
    const type=missionTypeLabel(mission.mission_type);
    const schedule=state.dues.some(due=>due.reservation_id===reservation.id)
      ? `Échéancier quotidien existant : ${state.dues.filter(due=>due.reservation_id===reservation.id).length} jour(s). Consultez l’administration pour le suivi des règlements.`
      : dailyPlanReady
        ? `Paiement quotidien prévu : ${money($('team-daily-amount').value)} par jour, à compter du ${dateInTana(reservation.start_at)}.`
        : '';
    const lines=[
      `RENT CAR SERVICE — ${type.toUpperCase()}`,
      `Client : ${reservation.customer_name || '—'}`,
      `Téléphone client : ${reservation.customer_phone || '—'}`,
      `Adresse de rendez-vous : ${mission.handover_address || '—'}`,
      `Trajet : ${[reservation.trip_from,reservation.trip_to].filter(Boolean).join(' → ') || '—'}`,
      `Date/heure : ${dateTime(mission.starts_at)}${mission.mission_type==='delivery_and_recovery' ? ` — fin ${dateTime(mission.expires_at)}` : ''}`,
      `Note du client : ${reservation.notes || '—'}`,
      `Note pour vous : ${mission.notes || '—'}`,
      `Consignes : ${mission.driver_instructions || '—'}`,
      `Total payé par le client : ${money(paid)}`,
      `Reste à payer : ${money(balance)}`,
      schedule,
      `Votre login : ${driver.login_name || 'à communiquer par l’administration'}`,
      `Espace chauffeur : ${driverUrl}`,
      'Le mot de passe initial vous sera remis séparément. Ne le partagez pas dans ce fil WhatsApp.',
      `Répondre : accepter ${acceptUrl.href}`,
      `Répondre : refuser ${refuseUrl.href}`,
      'Après acceptation, ouvrez l’espace chauffeur pour faire l’état des lieux au départ et au retour.'
    ].filter(Boolean);
    const text=encodeURIComponent(lines.join('\n'));
    return {phone,url:`https://wa.me/${phone}?text=${text}`};
  }
  function reviewValue(label, value) {
    const emphasis=label==='Reste à percevoir'?' team-review-row--balance':'';
    return `<div class="team-review-row${emphasis}"><span>${esc(label)}</span><strong>${esc(value || '—')}</strong></div>`;
  }
  function closeMissionReview() {
    state.pendingMission = null;
    const modal=$('team-mission-review-modal');
    if (modal) modal.hidden=true;
    const message=$('team-mission-review-message'); if(message)message.textContent='';
  }
  function openMissionReview(pending) {
    state.pendingMission=pending;
    const {driver,reservation,mission,dailyEnabled,dailyAmount,alreadyHasPlan}=pending;
    const paid=Math.max(Number(reservation.deposit_amount||0),state.payments.filter(payment=>payment.reservation_id===reservation.id).reduce((sum,payment)=>sum+Number(payment.amount||0),0));
    const balance=Math.max(0,Number(reservation.total_amount||0)-paid);
    $('team-mission-review-content').innerHTML = `<div class="team-review-section"><h3>Client et réservation</h3>${reviewValue('Réservation',`${reservation.reference} — ${reservation.customer_name}`)}${reviewValue('Téléphone client',reservation.customer_phone)}${reviewValue('Trajet',[reservation.trip_from,reservation.trip_to].filter(Boolean).join(' → '))}${reviewValue('Adresse de rendez-vous',mission.handover_address)}</div><div class="team-review-section"><h3>Mission et chauffeur</h3>${reviewValue('Chauffeur',`${driver.name}${driver.login_name?' — '+driver.login_name:''}`)}${reviewValue('Type',missionTypeLabel(mission.mission_type))}${reviewValue('Début',dateTime(mission.starts_at))}${reviewValue('Fin',dateTime(mission.expires_at))}${reviewValue('Coût livraison',money(mission.custom_delivery_cost))}${reviewValue('Coût récupération',money(mission.custom_recovery_cost))}</div><div class="team-review-section"><h3>À percevoir et consignes</h3>${reviewValue('Total réservation',money(reservation.total_amount))}${reviewValue('Déjà payé',money(paid))}${reviewValue('Reste à percevoir',money(balance))}${reviewValue('Note chauffeur',mission.notes)}${reviewValue('Consignes',mission.driver_instructions)}${reviewValue('Échéancier quotidien',dailyEnabled?(alreadyHasPlan?'Déjà actif — conservé':`${money(dailyAmount)} par jour`):'Non activé')}</div><p class="muted">Après confirmation, la mission sera enregistrée dans le tableau chauffeur et WhatsApp s’ouvrira avec le message prérempli. Vous pourrez vérifier le message puis appuyer sur Envoyer.</p>`;
    $('team-mission-review-modal').hidden=false;
    $('team-mission-review-confirm').focus();
  }
  async function createMission(event) {
    event.preventDefault();
    const form=event.currentTarget;
    const submitButton=event.submitter||form.querySelector('button[type="submit"]');
    if (!form.checkValidity()) {
      const invalidField=form.querySelector(':invalid');
      const label=invalidField?.id ? [...form.querySelectorAll('label[for]')].find(item=>item.htmlFor===invalidField.id)?.textContent?.trim() : '';
      const validity=invalidField?.validity;
      const issue=validity?.valueMissing?'est obligatoire':validity?.rangeUnderflow?'est inférieur au minimum':validity?.stepMismatch?'ne respecte pas le pas autorisé':'est invalide';
      show(label ? `Le champ « ${label} » ${issue}.` : 'Vérifiez les champs obligatoires de la mission.');
      form.reportValidity();
      invalidField?.focus();
      return;
    }
    if (submitButton) submitButton.disabled=true;
    show('Vérification des informations et préparation du récapitulatif…');
    try {
      const start=$('team-mission-start').value, end=$('team-mission-end').value;
      if (!start || !end || new Date(end)<=new Date(start) || new Date(end)-new Date(start)>24*3600000) return show('La mission doit durer plus de 0 heure et 24 heures maximum. Pour une location plus longue, gardez une seule réservation et utilisez l’échéancier quotidien.');
      const driver=state.drivers.find(item=>item.id===$('team-mission-driver').value);
      const reservation=state.reservations.find(item=>item.id===$('team-mission-reservation').value);
      if (!driver || !reservation) return show('Sélectionnez une réservation confirmée et un chauffeur disposant d’un compte team.');
      if (!driver.auth_user_id || !driver.login_name) return show('Ce chauffeur n’a pas encore de compte team. Créez son compte dans la section Comptes team avant de lui attribuer la mission.');
      if (!toWhatsAppNumber(driver.whatsapp || driver.phone)) return show('Aucun numéro WhatsApp valide n’est enregistré pour ce chauffeur. Corrigez sa fiche chauffeur avant l’attribution.');
      const dailyEnabled=$('team-daily-enabled').checked, dailyAmount=Number($('team-daily-amount').value||0);
      const alreadyHasPlan=state.dues.some(due=>due.reservation_id===reservation.id);
      if (dailyEnabled && !alreadyHasPlan && (!Number.isFinite(dailyAmount)||dailyAmount<=0)) return show('Saisissez un montant quotidien supérieur à zéro.');
      if (dailyEnabled && !alreadyHasPlan && dailyAmount*rentalDayCount(reservation)>Number(reservation.total_amount||0)) return show('Le montant quotidien multiplié par le nombre de jours dépasserait le total de la réservation. Ajustez le montant par jour avant de continuer.');
      const rawToken=randomToken(), tokenHash=await sha256Hex(rawToken);
      const mission={chauffeur_id:driver.id,reservation_id:reservation.id,mission_type:$('team-mission-type').value,custom_delivery_cost:Number($('team-mission-delivery-cost').value||0),custom_recovery_cost:Number($('team-mission-recovery-cost').value||0),starts_at:isoFromLocal(start),expires_at:isoFromLocal(end),acceptance_token_hash:tokenHash,acceptance_expires_at:isoFromLocal(end),handover_address:$('team-mission-address').value.trim()||reservation.customer_address||reservation.trip_from||reservation.trip_to||null,notes:$('team-mission-notes').value.trim()||null,driver_instructions:$('team-mission-instructions').value.trim()||null};
      openMissionReview({form,driver,reservation,mission,rawToken,dailyEnabled,dailyAmount,alreadyHasPlan});
    } catch(error) {
      show(`Impossible de préparer le récapitulatif : ${error?.message||error}`);
    } finally {
      if (submitButton) submitButton.disabled=false;
    }
  }
  async function submitPendingMission() {
    const pending=state.pendingMission;if(!pending)return;
    const {form,driver,reservation,mission,rawToken,dailyEnabled,dailyAmount,alreadyHasPlan}=pending;
    const button=$('team-mission-review-confirm'),message=$('team-mission-review-message');
    // Open a blank tab synchronously in the confirmation click so popup blockers
    // allow WhatsApp to be navigated there after the asynchronous Supabase save.
    let whatsappWindow=null;
    try { whatsappWindow=window.open('about:blank','_blank'); } catch (_) {}
    if (whatsappWindow) { try { whatsappWindow.document.title='Préparation de WhatsApp…'; } catch (_) {} }
    const closePendingWhatsApp=()=>{try{if(whatsappWindow&&!whatsappWindow.closed)whatsappWindow.close();}catch(_){}};
    button.disabled=true; message.textContent='Enregistrement de la mission…';
    try {
      const {data:created,error}=await db.rpc('assign_chauffeur_mission',{p_chauffeur_id:mission.chauffeur_id,p_reservation_id:mission.reservation_id,p_mission_type:mission.mission_type,p_custom_delivery_cost:mission.custom_delivery_cost,p_custom_recovery_cost:mission.custom_recovery_cost,p_starts_at:mission.starts_at,p_expires_at:mission.expires_at,p_handover_address:mission.handover_address,p_notes:mission.notes,p_driver_instructions:mission.driver_instructions,p_acceptance_token_hash:mission.acceptance_token_hash,p_acceptance_expires_at:mission.acceptance_expires_at});
      if (error) {
        closePendingWhatsApp();
        const detail=error.code==='42501'||/row-level security|permission denied/i.test(error.message||'') ? 'Attribution bloquée par la sécurité Supabase : reconnectez-vous avec un super-administrateur actif.' : /column .* does not exist|function .* does not exist|could not find the function|schema cache/i.test(error.message||'') ? `La migration chauffeur n’est pas appliquée sur Supabase. Détail : ${error.message}` : `Attribution impossible : ${error.message}`;
        message.textContent=detail; return;
      }
      let warning='Mission enregistrée dans le tableau de bord chauffeur. '; let dailyPlanReady=alreadyHasPlan;
      if (dailyEnabled && !alreadyHasPlan) {
        const rows=buildDailyDues(reservation,dailyAmount),scheduleResult=await db.from('reservation_daily_dues').upsert(rows,{onConflict:'reservation_id,due_date',ignoreDuplicates:true});
        if (scheduleResult.error) warning+=`L’échéancier n’a pas pu être créé : ${scheduleResult.error.message}. `;
        else { state.dues.push(...rows); dailyPlanReady=true; warning+=`${rows.length} échéance(s) quotidienne(s) créée(s). `; }
      } else if (dailyEnabled && alreadyHasPlan) warning+='L’échéancier déjà actif a été conservé. ';
      const messageData=makeWhatsAppMessage({...mission,id:created},reservation,driver,rawToken,dailyPlanReady);
      if (whatsappWindow && messageData.url) {
        try { whatsappWindow.location.href=messageData.url; } catch (_) { closePendingWhatsApp(); whatsappWindow=null; }
      } else closePendingWhatsApp();
      closeMissionReview(); form.reset(); $('team-mission-start').value=''; $('team-mission-end').value=''; $('team-daily-fields').classList.add('hidden');
      await load();
      show(whatsappWindow && messageData.url
        ? `${warning}WhatsApp s’est ouvert avec le message prérempli. Vérifiez-le puis appuyez sur Envoyer.`
        : `${warning}Le navigateur a bloqué l’ouverture automatique; utilisez le bouton ci-dessous pour ouvrir WhatsApp et transmettre la mission.`,messageData.url);
    } catch(error) { closePendingWhatsApp(); message.textContent=`Erreur technique : ${error?.message||error}`; }
    finally { button.disabled=false; }
  }
  async function cancelMission(id) {
    if (!confirm('Annuler cette mission ?')) return;
    const {error}=await db.from('chauffeur_missions').update({status:'cancelled',acceptance_token_hash:null,updated_at:new Date().toISOString()}).eq('id',id);
    if (error) return show(error.message);
    await load();
  }
  // Remplace le prompt historique afin que chaque règlement quotidien garde sa date d'échéance.
  window.recordPayment = async function(id) {
    const {data:reservation,error:reservationError}=await db.from('reservations').select('id,deposit_amount,total_amount,payment_method,mobile_reference,mobile_number').eq('id',id).single();
    if (reservationError || !reservation) return alert(`Réservation introuvable : ${reservationError?.message || ''}`);
    const {data:dues,error:duesError}=await db.from('reservation_daily_dues').select('due_date,due_amount').eq('reservation_id',id).order('due_date');
    if (duesError) return alert(`Impossible de charger les échéances : ${duesError.message}`);
    let dueDate=null,expected=Number(reservation.total_amount||0);
    if ((dues||[]).length) {
      const {data:payments,error:paymentsError}=await db.from('payments').select('amount,due_date').eq('reservation_id',id).not('due_date','is',null);
      if (paymentsError) return alert(`Impossible de charger les paiements : ${paymentsError.message}`);
      const options=dues.map(due=>{const paid=(payments||[]).filter(payment=>payment.due_date===due.due_date).reduce((sum,payment)=>sum+Number(payment.amount||0),0);return {due,remaining:Math.max(0,Number(due.due_amount)-paid)};}).filter(item=>item.remaining>0);
      if (!options.length) return alert('Toutes les échéances quotidiennes sont réglées.');
      const choice=prompt(`Date de l’échéance à régler :\n${options.map((item,index)=>`${index+1}. ${item.due.due_date} — reste ${money(item.remaining)}`).join('\n')}\n\nSaisissez la date (AAAA-MM-JJ).`,options[0].due.due_date);
      if (!choice) return;
      const selected=options.find(item=>item.due.due_date===choice.trim());
      if (!selected) return alert('Date d’échéance invalide.');
      dueDate=selected.due.due_date;expected=selected.remaining;
    }
    const amount=Number(prompt(`Montant du paiement (reste attendu : ${money(expected)}) :`,String(expected)));
    if (!Number.isFinite(amount)||amount<=0||(dueDate&&amount>expected)) return alert('Montant invalide.');
    const method=prompt('Mode de paiement (espèce ou mobile_money) :',reservation.payment_method||'espece')||'espece';
    const reference=method==='mobile_money'?prompt('Référence Mobile Money :',reservation.mobile_reference||'')||null:null;
    const number=method==='mobile_money'?prompt('Numéro Mobile Money :',reservation.mobile_number||'')||null:null;
    const {error}=await db.from('payments').insert({reservation_id:id,amount,method,due_date:dueDate,note:reference?`Référence: ${reference} — Numéro: ${number||''}`:null});
    if(error)return alert(error.message);
    const {error:updateError}=await db.from('reservations').update({payment_method:method,mobile_reference:reference,mobile_number:number,status:'reserved'}).eq('id',id);
    if(updateError)alert(updateError.message);
    if(typeof window.refreshAll==='function')await window.refreshAll();else await load();
  };
  window.openTeamMissions = async function openTeamMissions() {
    addTab();
    document.querySelector('.nav button[data-tab="team-missions"]')?.click();
  };
  window.initTeamAdmin = async function initTeamAdmin() {
    addTab();
    if (document.getElementById('app-view')?.classList.contains('hidden') === false) await load();
  };
  document.addEventListener('DOMContentLoaded', () => {
    window.initTeamAdmin();
  });
})();
