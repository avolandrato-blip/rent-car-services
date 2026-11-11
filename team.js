(() => {
  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => `${Number(value || 0).toLocaleString('fr-FR')} Ar`;
  const slug = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '').slice(0, 40) || 'chauffeur';
  const state = {driver:null,missions:[],selected:null,reservations:new Map(),vehicles:new Map(),payments:new Map(),dues:new Map(),checklists:new Map(),drawing:false,hasInk:false,checklistMission:null,checklistPhase:null,paymentMission:null};
  const formatDate = value => value ? new Date(value).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}) : '—';
  const typeLabel = type => ({delivery:'Livraison',recovery:'Récupération',delivery_and_recovery:'Livraison + récupération'}[type] || type);
  const statusLabel = status => ({assigned:'À accepter',accepted:'Mission acceptée',refused:'Mission refusée',in_progress:'En cours',completed:'Terminée',cancelled:'Annulée',expired:'Expirée'}[status] || status);
  const currentUser = async () => (await db.auth.getUser()).data.user;
  const keyForChecklist = (missionId,phase) => `${missionId}:${phase}`;

  async function login(event) {
    event.preventDefault();
    const loginName=slug($('team-login-name').value),password=$('team-login-password').value,error=$('team-login-error');
    error.textContent='';
    const button=event.currentTarget.querySelector('button[type="submit"]'); if(button)button.disabled=true;
    try {
      const {error:authError}=await db.auth.signInWithPassword({email:`${loginName}@team.rent-car-service.local`,password});
      if(authError)throw authError;
      await boot();
    } catch(err) {
      error.textContent=String(err?.message||'').includes('Invalid login credentials')?'Identifiant ou mot de passe incorrect.':`Connexion impossible : ${err?.message||err}`;
    } finally {if(button)button.disabled=false;}
  }
  async function boot() {
    const user=await currentUser(); if(!user)return;
    const {data:driver,error}=await db.from('chauffeurs').select('*').eq('auth_user_id',user.id).limit(1).maybeSingle();
    if(error||!driver){await db.auth.signOut();throw new Error('Ce compte n’est pas associé à un chauffeur actif.');}
    state.driver=driver;
    $('team-login').classList.add('hidden'); $('team-app').classList.remove('hidden');
    $('team-driver-name').textContent=` · ${driver.name||driver.login_name||'Chauffeur'}`;
    if(driver.must_change_password)$('password-modal').classList.remove('hidden');
    await loadMissions();
  }
  async function loadMissions() {
    const {data:missions,error}=await db.from('chauffeur_missions').select('*').eq('chauffeur_id',state.driver.id).order('starts_at',{ascending:false});
    if(error)return showError(`Impossible de charger les missions : ${error.message}`);
    state.missions=missions||[];
    const reservationIds=[...new Set(state.missions.map(mission=>mission.reservation_id))];
    state.reservations.clear();state.vehicles.clear();state.payments.clear();state.dues.clear();state.checklists.clear();
    if(reservationIds.length){
      const [reservations,payments,dues,checklists]=await Promise.all([
        db.from('reservations').select('*').in('id',reservationIds),
        db.from('payments').select('*').in('reservation_id',reservationIds).order('paid_at',{ascending:true}),
        db.from('reservation_daily_dues').select('reservation_id,due_date,due_amount').in('reservation_id',reservationIds).order('due_date'),
        db.from('chauffeur_mission_checklists').select('*').in('mission_id',state.missions.map(mission=>mission.id))
      ]);
      (reservations.data||[]).forEach(reservation=>state.reservations.set(reservation.id,reservation));
      const vehicleIds=[...new Set((reservations.data||[]).map(reservation=>reservation.vehicle_id).filter(Boolean))];
      if(vehicleIds.length){const vehicles=await db.from('vehicles').select('*').in('id',vehicleIds);(vehicles.data||[]).forEach(vehicle=>state.vehicles.set(vehicle.id,vehicle));}
      (payments.data||[]).forEach(payment=>{const list=state.payments.get(payment.reservation_id)||[];list.push(payment);state.payments.set(payment.reservation_id,list);});
      (dues.data||[]).forEach(due=>{const list=state.dues.get(due.reservation_id)||[];list.push(due);state.dues.set(due.reservation_id,list);});
      (checklists.data||[]).forEach(row=>state.checklists.set(keyForChecklist(row.mission_id,row.phase),row));
      if(reservations.error||payments.error||dues.error||checklists.error){
        showError(`Chargement partiel : ${reservations.error?.message||payments.error?.message||dues.error?.message||checklists.error?.message}. Si la migration chauffeur n’est pas encore appliquée, contactez l’administration.`);
      }
    }
    render();
  }
  const paymentTotal = reservationId => (state.payments.get(reservationId)||[]).reduce((sum,payment)=>sum+Number(payment.amount||0),0);
  const paidFor = reservationId => {const reservation=state.reservations.get(reservationId);return Math.max(Number(reservation?.deposit_amount||0),paymentTotal(reservationId));};
  const balanceFor = reservation => Math.max(0,Number(reservation?.total_amount||0)-paidFor(reservation?.id));
  const isSigned = (reservationId,mission=null) => Boolean(state.reservations.get(reservationId)?.client_signature_present||/Signature client\s*:/i.test(mission?.notes||''));
  function showError(message){const target=$('mission-detail');if(target)target.innerHTML=`<p class="notice-error">${esc(message)}</p>`;}
  function render(){
    const now=Date.now();
    state.missions.forEach(mission=>{if(['assigned','accepted'].includes(mission.status)&&new Date(mission.expires_at).getTime()<now)mission.status='expired';});
    const active=state.missions.filter(mission=>['assigned','accepted','in_progress'].includes(mission.status));
    const history=state.missions.filter(mission=>['completed','refused','expired','cancelled'].includes(mission.status));
    $('metric-active').textContent=active.length;
    $('metric-completed').textContent=state.missions.filter(mission=>mission.status==='completed').length;
    $('metric-balance').textContent=money(active.reduce((sum,mission)=>sum+balanceFor(state.reservations.get(mission.reservation_id)),0));
    $('metric-signed').textContent=state.missions.filter(mission=>isSigned(mission.reservation_id,mission)).length;
    $('active-missions').innerHTML=active.length?active.map(missionCard).join(''):'<div class="empty">Aucune mission active.</div>';
    $('completed-missions').innerHTML=history.length?history.slice(0,50).map(missionCard).join(''):'<div class="empty">Aucune mission dans l’historique.</div>';
    document.querySelectorAll('[data-open-mission]').forEach(button=>button.addEventListener('click',()=>selectMission(button.dataset.openMission)));
    if(state.selected)selectMission(state.selected.id,false);
  }
  function missionCard(mission){
    const reservation=state.reservations.get(mission.reservation_id)||{},vehicle=state.vehicles.get(reservation.vehicle_id)||{};
    return `<article class="mission-card ${mission.status==='completed'?'completed':''}"><h3>${esc(typeLabel(mission.mission_type))} — ${esc(reservation.reference||'Réservation')}</h3><div class="mission-meta"><span><b>Client :</b> ${esc(reservation.customer_name||'—')}</span><span><b>Véhicule :</b> ${esc(vehicle.name||vehicle.model||'—')}</span><span><b>Début :</b> ${formatDate(mission.starts_at)}</span><span><b>Fin :</b> ${formatDate(mission.expires_at)}</span></div><div class="mission-actions"><button class="btn outline" data-open-mission="${esc(mission.id)}">Voir la mission</button><span class="pill ${esc(mission.status)}">${esc(statusLabel(mission.status))}</span></div></article>`;
  }
  function checklistSummary(row){
    if(!row)return '<p class="muted">État des lieux non enregistré.</p>';
    const data=row.checklist||{},photoChecks=data.photo_checks||{};
    const labels={front:'avant',rear:'arrière',side:'côté / latéral',wheel:'jante',dashboard:'tableau de bord',client:'client devant la voiture',cin:'CIN',license:'permis'};
    const checked=Object.entries(labels).filter(([key])=>photoChecks[key]).map(([,label])=>label);
    const missing=Object.entries(labels).filter(([key])=>!photoChecks[key]).map(([,label])=>label);
    return `<p>Argent : ${money(data.cash_remaining)} · Carburant : ${esc(data.fuel_percent??'—')} % · CIN : ${data.cin_seen?'vérifiée':'non confirmée'} · Permis : ${data.license_seen?'vérifié':'non confirmé'} · Conduite : ${esc({happy:'🙂 satisfaisante',neutral:'😐 à surveiller',dangerous:'⚠️ dangereuse'}[data.driver_behavior]||'—')}</p><p class="muted">Photos cochées : ${checked.length?esc(checked.join(', ')):'aucune'}${missing.length?` · À vérifier : ${esc(missing.join(', '))}`:''}</p>${data.notes?`<p>Remarque : ${esc(data.notes)}</p>`:''}`;
  }
  function dailyScheduleHtml(reservationId){
    const dues=state.dues.get(reservationId)||[];if(!dues.length)return '';
    const payments=state.payments.get(reservationId)||[];
    return `<h4>Échéances quotidiennes de la location</h4><div class="table-wrap"><table class="due-table"><thead><tr><th>Date</th><th>Dû</th><th>Payé</th><th>Reste</th></tr></thead><tbody>${dues.map(due=>{const paid=payments.filter(payment=>payment.due_date===due.due_date).reduce((sum,payment)=>sum+Number(payment.amount||0),0);return `<tr><td>${new Date(`${due.due_date}T00:00:00`).toLocaleDateString('fr-FR')}</td><td>${money(due.due_amount)}</td><td>${money(paid)}</td><td>${money(Math.max(0,Number(due.due_amount)-paid))}</td></tr>`;}).join('')}</tbody></table></div><p class="muted">Le paiement quotidien est rattaché à la réservation. Les règlements sont saisis par l’administration avec la date correspondante.</p>`;
  }
  function clientRecapHtml(mission,reservation,departure){
    const checklist=departure?.checklist||{},signed=isSigned(reservation.id,mission),balance=balanceFor(reservation);
    const documents=checklist.cin_seen&&checklist.license_seen?'CIN et permis déjà vérifiés':'Présenter la CIN et le permis au chauffeur pour vérification';
    return `<div class="finance"><strong>Récapitulatif à communiquer au client</strong><ul><li>Être présent à ${esc(mission.handover_address||reservation.customer_address||'l’adresse convenue')} le ${formatDate(mission.starts_at)}.</li><li>${esc(documents)}.</li><li>${signed?'Signature du client enregistrée.':'Lire puis signer les documents remis par le chauffeur.'}</li><li>${balance>0?`Régler le solde restant de ${money(balance)}.`:'Aucun solde de réservation à régler.'}</li></ul></div>`;
  }
  function paymentSummaryHtml(reservation,payments){
    const details=payments.length?`<ul>${payments.map(payment=>`<li>${formatDate(payment.paid_at)} — <strong>${money(payment.amount)}</strong> — ${esc(payment.method||'mode non précisé')}${payment.due_date?` — échéance ${esc(payment.due_date)}`:''}${payment.source==='chauffeur'?' — encaissé par le chauffeur':' — enregistré par l’administration'}</li>`).join('')}</ul>`:'<p class="muted">Aucun règlement détaillé enregistré.</p>';
    const deposit=Number(reservation?.deposit_amount||0);
    return `<div class="finance"><div>Total de la réservation : <strong>${money(reservation?.total_amount)}</strong></div><div>Total payé / reçu comptabilisé : <strong>${money(paidFor(reservation?.id))}</strong></div><div>Solde restant : <strong>${money(balanceFor(reservation))}</strong></div>${deposit>0?`<div>Acompte indiqué sur la réservation : <strong>${money(deposit)}</strong></div>`:''}</div><h4>Détail des montants reçus</h4>${details}`;
  }
  function selectMission(id,scroll=true){
    state.selected=state.missions.find(mission=>mission.id===id)||null;if(!state.selected)return;
    const mission=state.selected,reservation=state.reservations.get(mission.reservation_id)||{},vehicle=state.vehicles.get(reservation.vehicle_id)||{},payments=state.payments.get(reservation.id)||[];
    const departure=state.checklists.get(keyForChecklist(mission.id,'departure')),returnCheck=state.checklists.get(keyForChecklist(mission.id,'return'));
    const statusControls=mission.status==='assigned'
      ? '<button id="mission-accept" class="btn primary">Accepter la mission</button><button id="mission-refuse" class="btn danger">Refuser</button>'
      : mission.status==='accepted'
        ? '<button id="mission-start" class="btn primary">Faire l’état des lieux de départ</button>'
        : mission.status==='in_progress'
          ? '<button id="mission-complete" class="btn primary">Terminer la mission — état des lieux de retour</button>' : '';
    const actions=['assigned','accepted','in_progress'].includes(mission.status)
      ? `${statusControls}<button id="mission-payment" class="btn outline">Enregistrer un paiement</button><button id="mission-signature" class="btn outline">Faire signer le client</button><button id="mission-invoice" class="btn outline">Générer la facture</button><button id="mission-contract" class="btn outline">Générer le contrat</button>`
      : statusControls;
    const title=mission.status==='completed'?'Fin de mission — situation financière':'Situation financière';
    $('mission-detail').innerHTML=`<h3>${esc(typeLabel(mission.mission_type))} — ${esc(reservation.reference||'Réservation')}</h3><p><b>Statut :</b> ${esc(statusLabel(mission.status))}<br><b>Client :</b> ${esc(reservation.customer_name||'—')}<br><b>Téléphone :</b> ${esc(reservation.customer_phone||'—')}<br><b>Adresse de rendez-vous :</b> ${esc(mission.handover_address||reservation.customer_address||'—')}<br><b>Trajet :</b> ${esc(reservation.trip_from||'—')} → ${esc(reservation.trip_to||'—')}<br><b>Véhicule :</b> ${esc(vehicle.name||vehicle.model||'—')} ${vehicle.registration_number?`(${esc(vehicle.registration_number)})`:''}<br><b>Location :</b> ${formatDate(reservation.start_at)} → ${formatDate(reservation.end_at)}<br><b>Mission :</b> ${formatDate(mission.starts_at)} → ${formatDate(mission.expires_at)}${reservation.notes?`<br><b>Note client :</b> ${esc(reservation.notes)}`:''}${mission.notes?`<br><b>Note interne :</b> ${esc(mission.notes)}`:''}${mission.driver_instructions?`<br><b>Consignes :</b> ${esc(mission.driver_instructions)}`:''}</p>${clientRecapHtml(mission,reservation,departure)}<div class="finance"><div>Total réservation : <strong>${money(reservation.total_amount)}</strong></div><div>Total déjà payé : <strong>${money(paidFor(reservation.id))}</strong></div><div>Reste à payer : <strong>${money(balanceFor(reservation))}</strong></div><div>Coût livraison : <strong>${money(mission.custom_delivery_cost)}</strong></div><div>Coût récupération : <strong>${money(mission.custom_recovery_cost)}</strong></div></div><div class="mission-actions">${actions}</div>${dailyScheduleHtml(reservation.id)}<h4>État des lieux au départ</h4>${checklistSummary(departure)}<h4>État des lieux au retour</h4>${checklistSummary(returnCheck)}<h4>${title}</h4>${paymentSummaryHtml(reservation,payments)}<p class="muted">Signature client : ${isSigned(reservation.id,mission)?'enregistrée':'non enregistrée'}</p>`;
    $('mission-accept')?.addEventListener('click',()=>respondMission(mission,'accept'));
    $('mission-refuse')?.addEventListener('click',()=>respondMission(mission,'refuse'));
    $('mission-start')?.addEventListener('click',()=>openChecklist(mission,'departure'));
    $('mission-complete')?.addEventListener('click',()=>openChecklist(mission,'return'));
    $('mission-payment')?.addEventListener('click',()=>openPayment(mission));
    $('mission-signature')?.addEventListener('click',()=>openSignature(mission));
    $('mission-invoice')?.addEventListener('click',()=>printMission(mission,'invoice'));
    $('mission-contract')?.addEventListener('click',()=>printMission(mission,'contract'));
    if(scroll)$('mission-detail').scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function respondMission(mission,response){
    const label=response==='accept'?'accepter':'refuser';
    if(response==='refuse'&&!confirm('Confirmer le refus de cette mission ?'))return;
    const {data,error}=await db.rpc('respond_to_chauffeur_mission_as_driver',{p_mission_id:mission.id,p_response:response});
    if(error)return alert(`Réponse non enregistrée : ${error.message}. Vérifiez que la migration du workflow chauffeur est appliquée.`);
    if(data!==true)return alert(`Impossible de ${label} : la mission a expiré, a déjà reçu une réponse ou n’est pas associée à votre compte.`);
    await loadMissions();
  }
  function photoCheckMarkup(key,label,checked){
    return `<label class="checklist-photo"><input id="checklist-photo-${key}" type="checkbox" ${checked?'checked':''}> <span>${esc(label)}</span><small class="muted">Cochez après avoir pris la photo et envoyez-la sur WhatsApp.</small></label>`;
  }
  function openChecklist(mission,phase){
    state.checklistMission=mission;state.checklistPhase=phase;
    const departure=phase==='departure',existing=state.checklists.get(keyForChecklist(mission.id,phase));
    $('checklist-title').textContent=departure?'État des lieux au départ':'État des lieux au retour';
    $('checklist-phase-help').textContent=departure?'Complétez les contrôles avant de remettre le véhicule.':'Documentez l’état du véhicule et l’argent restant avant de clôturer la mission. Les paiements déjà enregistrés sont récapitulés ci-dessous.';
    $('checklist-cash').value=existing?.checklist?.cash_remaining??0;
    $('checklist-fuel').value=existing?.checklist?.fuel_percent??'';
    $('checklist-cin-seen').checked=Boolean(existing?.checklist?.cin_seen);
    $('checklist-license-seen').checked=Boolean(existing?.checklist?.license_seen);
    $('checklist-cin-seen').disabled=!departure;
    $('checklist-license-seen').disabled=!departure;
    $('checklist-notes').value=existing?.checklist?.notes||'';
    document.querySelectorAll('input[name="driver-behavior"]').forEach(input=>input.checked=input.value===(existing?.checklist?.driver_behavior||''));
    $('checklist-documents').classList.toggle('hidden',!departure);
    const photoChecks=existing?.checklist?.photo_checks||{};
    $('checklist-vehicle-photos').innerHTML=[['front','Photo avant'],['rear','Photo arrière'],['side','Photo côté / latéral'],['wheel','Photo jante'],['dashboard','Photo tableau de bord'],['client','Photo du client devant la voiture']].map(([key,label])=>photoCheckMarkup(key,label,photoChecks[key])).join('');
    $('checklist-document-photos').innerHTML=departure?[['cin','Photo CIN'],['license','Photo permis']].map(([key,label])=>photoCheckMarkup(key,label,photoChecks[key])).join(''):'';
    $('checklist-payment-content').innerHTML=paymentSummaryHtml(state.reservations.get(mission.reservation_id)||{},state.payments.get(mission.reservation_id)||[]);
    $('checklist-payment-summary').classList.toggle('hidden',departure);
    $('checklist-message').textContent=existing?'Une checklist existe déjà. Vous pouvez la compléter ou la remplacer. Aucun fichier photo n’est conservé dans l’application.':'Les photos sont uniquement des rappels : cochez-les après les avoir envoyées sur WhatsApp.';
    $('checklist-modal').classList.remove('hidden');
  }
  async function saveChecklist(event){
    event.preventDefault();
    const mission=state.checklistMission,phase=state.checklistPhase;
    if(!mission||!phase)return;
    const button=$('checklist-save'),message=$('checklist-message');
    const behavior=document.querySelector('input[name="driver-behavior"]:checked')?.value;
    const fuel=Number($('checklist-fuel').value),cash=Number($('checklist-cash').value);
    if(!behavior||!Number.isFinite(fuel)||fuel<0||fuel>100||!Number.isFinite(cash)||cash<0)return message.textContent='Vérifiez le niveau de carburant, le reste d’argent et l’appréciation de conduite.';
    button.disabled=true;message.textContent='Enregistrement de la checklist…';
    try{
      const user=await currentUser(),old=state.checklists.get(keyForChecklist(mission.id,phase));
      const photoKeys=phase==='departure'?['front','rear','side','wheel','dashboard','client','cin','license']:['front','rear','side','wheel','dashboard','client'];
      const photo_checks=Object.fromEntries(photoKeys.map(key=>[key,$(`checklist-photo-${key}`)?.checked===true]));
      const missing=photoKeys.filter(key=>!photo_checks[key]);
      if(missing.length){message.textContent=`Cochez les rappels photo effectués : ${missing.map(key=>({front:'avant',rear:'arrière',side:'côté',wheel:'jante',dashboard:'tableau de bord',client:'client devant la voiture',cin:'CIN',license:'permis'}[key])).join(', ')}.`;return;}
      const checklist={cash_remaining:cash,fuel_percent:fuel,cin_seen:phase==='departure'?$('checklist-cin-seen').checked:Boolean(old?.checklist?.cin_seen),license_seen:phase==='departure'?$('checklist-license-seen').checked:Boolean(old?.checklist?.license_seen),driver_behavior:behavior,notes:$('checklist-notes').value.trim(),photo_checks};
      const {error}=await db.from('chauffeur_mission_checklists').upsert({mission_id:mission.id,phase,submitted_by:user.id,checklist,photos:{},completed_at:new Date().toISOString()},{onConflict:'mission_id,phase'});
      if(error)throw error;
      const nextStatus=phase==='departure'?'in_progress':'completed';
      const update={status:nextStatus,updated_at:new Date().toISOString(),...(phase==='departure'?{started_at:new Date().toISOString()}:{completed_at:new Date().toISOString(),completed_by:user.id})};
      const result=await db.from('chauffeur_missions').update(update).eq('id',mission.id);
      if(result.error)throw result.error;
      $('checklist-modal').classList.add('hidden');
      await loadMissions();
    }catch(error){message.textContent=`Enregistrement impossible : ${error?.message||error}`;}
    finally{button.disabled=false;}
  }
  function dueOptionsFor(reservationId){
    const dues=state.dues.get(reservationId)||[],payments=state.payments.get(reservationId)||[];
    return dues.map(due=>{const paid=payments.filter(payment=>payment.due_date===due.due_date).reduce((sum,payment)=>sum+Number(payment.amount||0),0);return {due,remaining:Math.max(0,Number(due.due_amount)-paid)};}).filter(item=>item.remaining>0);
  }
  function selectedPaymentExpected(){
    const mission=state.paymentMission;if(!mission)return 0;
    const reservation=state.reservations.get(mission.reservation_id)||{};
    if(!(state.dues.get(reservation.id)||[]).length)return balanceFor(reservation);
    const dueDate=$('payment-due-date').value;
    return dueOptionsFor(reservation.id).find(item=>item.due.due_date===dueDate)?.remaining||0;
  }
  function updatePaymentExpected(resetAmount=false){
    const expected=selectedPaymentExpected(),amount=$('payment-amount');
    $('payment-expected').textContent=money(expected);
    amount.max=String(expected);
    if(resetAmount||!amount.value||Number(amount.value)>expected)amount.value=expected>0?String(expected):'';
    $('payment-save').disabled=expected<=0;
  }
  function openPayment(mission){
    const reservation=state.reservations.get(mission.reservation_id)||{},dues=state.dues.get(reservation.id)||[];
    if(!(dues.length?dueOptionsFor(reservation.id).length:balanceFor(reservation)>0))return alert('Aucun solde ne reste à encaisser.');
    state.paymentMission=mission;
    $('payment-client-label').textContent=`${reservation.customer_name||'Client'} — ${reservation.reference||'Réservation'}`;
    const dueField=$('payment-due-field');
    dueField.classList.toggle('hidden',!dues.length);
    $('payment-due-date').innerHTML=dues.length?dueOptionsFor(reservation.id).map(item=>`<option value="${esc(item.due.due_date)}">${new Date(`${item.due.due_date}T00:00:00`).toLocaleDateString('fr-FR')} — reste ${money(item.remaining)}</option>`).join(''):'';
    $('payment-method').value='espèce';$('payment-note').value='';$('payment-message').textContent='';
    $('payment-amount').value='';
    updatePaymentExpected(true);
    $('payment-modal').classList.remove('hidden');
  }
  async function savePayment(event){
    event.preventDefault();
    const mission=state.paymentMission;if(!mission)return;
    const reservation=state.reservations.get(mission.reservation_id)||{},amount=Number($('payment-amount').value),expected=selectedPaymentExpected(),message=$('payment-message'),button=$('payment-save');
    if(!Number.isFinite(amount)||amount<=0||amount>expected){message.textContent=`Montant invalide. Le montant doit être supérieur à 0 et ne pas dépasser ${money(expected)}.`;return;}
    button.disabled=true;message.className='notice-ok';message.textContent='Enregistrement du paiement…';
    try{
      const {error}=await db.from('payments').insert({reservation_id:reservation.id,amount,method:$('payment-method').value.trim()||'non précisé',note:$('payment-note').value.trim()||null,due_date:(state.dues.get(reservation.id)||[]).length?$('payment-due-date').value:null,recorded_by_chauffeur_id:state.driver.id,source:'chauffeur'});
      if(error)throw error;
      $('payment-modal').classList.add('hidden');state.paymentMission=null;
      await loadMissions();
    }catch(error){message.className='notice-error';message.textContent=`Paiement non enregistré : ${error?.message||error}`;}
    finally{button.disabled=false;}
  }
  async function printMission(mission,kind){
    const reservation={...(state.reservations.get(mission.reservation_id)||{})},vehicle={...(state.vehicles.get(reservation.vehicle_id)||{})};
    window.reservations=[reservation];window.vehicles=[vehicle];window.paidFor=item=>paidFor(item.id);
    if(typeof window.printDocument!=='function')return alert('Générateur de documents indisponible.');
    const printTab=window.open('','_blank');
    if(!printTab)return alert('Autorisez les fenêtres pop-up pour générer le document.');
    printTab.document.write('<!doctype html><html lang="fr"><meta charset="utf-8"><title>Préparation du contrat</title><body>Chargement des signatures…</body></html>');
    try{
      const {data,error}=await db.rpc('get_chauffeur_mission_contract_signatures',{p_mission_id:mission.id});
      if(error)throw error;
      const signatures=Array.isArray(data)?data[0]:data;
      if(!signatures)throw new Error('Cette mission n’est pas accessible avec votre compte chauffeur.');
      await window.printDocument(reservation.id,kind,signatures.lessor_signature_data||'',signatures.client_signature_data||'',printTab);
    }catch(error){
      printTab.close();
      alert(`Impossible de charger les signatures du contrat : ${error?.message||error}`);
    }
  }
  function setupCanvas(){
    const canvas=$('team-signature-canvas');if(!canvas)return;
    const rect=canvas.getBoundingClientRect(),ratio=Math.max(window.devicePixelRatio||1,1);canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;
    const context=canvas.getContext('2d');context.scale(ratio,ratio);context.lineWidth=2.2;context.lineCap='round';context.strokeStyle='#102d46';
    const point=event=>{const bounds=canvas.getBoundingClientRect();return[event.clientX-bounds.left,event.clientY-bounds.top];};
    canvas.onpointerdown=event=>{state.drawing=true;state.hasInk=true;canvas.setPointerCapture(event.pointerId);const[x,y]=point(event);context.beginPath();context.moveTo(x,y);};
    canvas.onpointermove=event=>{if(!state.drawing)return;const[x,y]=point(event);context.lineTo(x,y);context.stroke();};
    canvas.onpointerup=()=>{state.drawing=false;};canvas.onpointercancel=()=>{state.drawing=false;};
  }
  function openSignature(mission){
    state.selected=mission;state.hasInk=false;
    $('signature-client-label').textContent=`${state.reservations.get(mission.reservation_id)?.customer_name||'Client'} — ${state.reservations.get(mission.reservation_id)?.customer_phone||''}`;
    $('signature-message').textContent='';$('signature-save').disabled=false;$('signature-modal').classList.remove('hidden');requestAnimationFrame(setupCanvas);
  }
  function clearSignature(){const canvas=$('team-signature-canvas');canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);state.hasInk=false;}
  async function saveSignature(){
    const button=$('signature-save'),message=$('signature-message');
    if(!state.selected||!state.hasInk){message.textContent='La signature est vide.';return;}
    const mission=state.selected,reservation=state.reservations.get(mission.reservation_id)||{},data=$('team-signature-canvas').toDataURL('image/png');
    button.disabled=true;message.className='notice-ok';message.textContent='Enregistrement de la signature…';
    try{
      const {data:saved,error}=await db.rpc('save_chauffeur_reservation_signature',{p_mission_id:mission.id,p_signature_data:data,p_signer_name:reservation.customer_name||'',p_signer_phone:reservation.customer_phone||''});
      if(error)throw error;
      if(saved!==true)throw new Error('Signature refusée : vérifiez que la mission est encore active et que vous êtes connecté avec le bon compte.');
      $('signature-modal').classList.add('hidden');state.hasInk=false;
      await loadMissions();
    }catch(error){message.className='notice-error';message.textContent=`Signature non validée : ${error?.message||error}`;}
    finally{button.disabled=false;}
  }
  async function changePassword(event){
    event.preventDefault();const first=$('new-password').value,second=$('new-password-confirm').value;
    if(first.length<8||first!==second)return $('password-message').textContent='Les mots de passe doivent être identiques et contenir au moins 8 caractères.';
    const {error}=await db.auth.updateUser({password:first});if(error)return $('password-message').textContent=error.message;
    const {error:updateError}=await db.from('chauffeurs').update({must_change_password:false}).eq('id',state.driver.id);if(updateError)return $('password-message').textContent=updateError.message;
    $('password-modal').classList.add('hidden');
  }
  async function logout(){await db.auth.signOut();window.location.reload();}
  document.addEventListener('DOMContentLoaded',async()=>{
    $('team-login-form').addEventListener('submit',login);$('team-logout').addEventListener('click',logout);$('change-password-form').addEventListener('submit',changePassword);
    $('checklist-form').addEventListener('submit',saveChecklist);$('checklist-cancel').addEventListener('click',()=>$('checklist-modal').classList.add('hidden'));
    $('payment-form').addEventListener('submit',savePayment);$('payment-cancel').addEventListener('click',()=>$('payment-modal').classList.add('hidden'));$('payment-due-date').addEventListener('change',()=>updatePaymentExpected(true));
    $('signature-clear').addEventListener('click',clearSignature);$('signature-cancel').addEventListener('click',()=>$('signature-modal').classList.add('hidden'));$('signature-save').addEventListener('click',saveSignature);
    const {data}=await db.auth.getSession();if(data.session){try{await boot();}catch(error){$('team-login-error').textContent=error.message;}}
  });
})();
