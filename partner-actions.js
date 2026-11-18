(() => {
  if (typeof document === 'undefined') return;
  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let vehicles = [], reservations = [], busy = false, partnerUserId = null;
  const money = n => `${Math.round(Number(n || 0)).toLocaleString('fr-FR')} Ar`;
  function notify(text, error = false) {
    const node = $('app-message'); if (!node) return;
    node.textContent = text; node.className = `notice${error ? ' error' : ''}`; node.hidden = false;
  }
  function requireVehicleOptions(selected = '') {
    return vehicles.filter(v => v.status !== 'contract_ended').map(v => `<option value="${esc(v.id)}" ${v.id === selected ? 'selected' : ''}>${esc(v.name || v.make || 'Voiture')}</option>`).join('');
  }
  function getDialog() {
    let dlg = $('partner-action-dialog');
    if (!dlg) { document.body.insertAdjacentHTML('beforeend', '<dialog id="partner-action-dialog" class="partner-action-dialog"><form method="dialog"><button class="dialog-close" aria-label="Fermer">×</button></form><div id="partner-action-content"></div></dialog>'); dlg = $('partner-action-dialog'); }
    return dlg;
  }
  function openForm(kind, row = null) {
    const dlg = getDialog(), host = $('partner-action-content');
    if (kind === 'reservation') {
      const vId = row?.vehicle_id || vehicles[0]?.id || '';
      const localInput = value => value ? new Date(new Date(value).getTime() + 3*60*60*1000).toISOString().slice(0,16) : '';
      const start = localInput(row?.start_at);
      const end = localInput(row?.end_at);
      host.innerHTML = `<h2>${row ? 'Modifier la réservation' : 'Nouvelle réservation'}</h2><p>Cette réservation concerne uniquement une voiture qui vous est attribuée.</p><form id="partner-booking-form" class="form-grid"><input type="hidden" name="id" value="${esc(row?.id || '')}"><label>Voiture<select name="vehicle_id" required>${requireVehicleOptions(vId)}</select></label><label>Nom du client<input name="customer_name" maxlength="160" required value="${esc(row?.customer_name || '')}"></label><label>Téléphone<input name="customer_phone" maxlength="50" required value="${esc(row?.customer_phone || '')}"></label><label>WhatsApp<input name="whatsapp_phone" maxlength="50" value="${esc(row?.whatsapp_phone || '')}"></label><label>Email<input name="customer_email" type="email" value="${esc(row?.customer_email || '')}"></label><label>Adresse<input name="customer_address" value="${esc(row?.customer_address || '')}"></label><label>CIN<input name="customer_cin" value="${esc(row?.customer_cin || '')}"></label><label>Permis<input name="customer_license" value="${esc(row?.customer_license || '')}"></label><label>Début<input type="datetime-local" name="start_at" required value="${esc(start)}"></label><label>Fin<input type="datetime-local" name="end_at" required value="${esc(end)}"></label><label>Tarif journalier (Ar)<input type="number" min="0" name="daily_rate" required value="${esc(row?.daily_rate ?? '')}"></label><label>Tarif 12 h (Ar)<input type="number" min="0" name="rate_12h" value="${esc(row?.rate_12h ?? row?.daily_rate ?? '')}"></label><label>Total (Ar)<input type="number" min="0" name="total_amount" required value="${esc(row?.total_amount ?? '')}"></label><label>Acompte (Ar)<input type="number" min="0" name="deposit_amount" value="${esc(row?.deposit_amount ?? 0)}"></label><label>Mode de paiement<input name="payment_method" value="${esc(row?.payment_method || '')}"></label><label>Départ<input name="trip_from" value="${esc(row?.trip_from || '')}"></label><label>Destination<input name="trip_to" value="${esc(row?.trip_to || '')}"></label><label>Livraison (Ar)<input type="number" min="0" name="delivery_fee" value="${esc(row?.delivery_fee || 0)}"></label><label>Récupération (Ar)<input type="number" min="0" name="recovery_fee" value="${esc(row?.recovery_fee || 0)}"></label><label class="field full">Notes<textarea name="notes" rows="2">${esc(row?.notes || '')}</textarea></label><div class="field full"><button class="btn primary" type="submit">${row ? 'Enregistrer' : 'Créer la réservation'}</button></div></form>`;
      $('partner-booking-form').addEventListener('submit', saveBooking);
    } else {
      host.innerHTML = `<h2>Bloquer une période</h2><p>Le blocage apparaîtra au calendrier de disponibilité de votre voiture.</p><form id="partner-block-form" class="form-grid"><label>Voiture<select name="vehicle_id" required>${requireVehicleOptions()}</select></label><label>Début<input type="datetime-local" name="start_at" required></label><label>Fin<input type="datetime-local" name="end_at" required></label><label>Motif<input name="reason" maxlength="160" placeholder="Indisponibilité / entretien"></label><div class="field full"><button class="btn primary" type="submit">Enregistrer le blocage</button></div></form>`;
      $('partner-block-form').addEventListener('submit', saveBlock);
    }
    dlg.showModal();
  }
  async function saveBooking(event) {
    event.preventDefault(); if (busy) return;
    const f = new FormData(event.currentTarget), id = String(f.get('id') || ''), start = new Date(`${f.get('start_at')}:00+03:00`), end = new Date(`${f.get('end_at')}:00+03:00`);
    if (!(start < end)) return notify('La date de fin doit être postérieure au début.', true);
    const payload = { vehicle_id:String(f.get('vehicle_id')), customer_name:String(f.get('customer_name')||'').trim(), customer_phone:String(f.get('customer_phone')||'').trim(), whatsapp_phone:String(f.get('whatsapp_phone')||'').trim()||null, customer_email:String(f.get('customer_email')||'').trim()||null, customer_address:String(f.get('customer_address')||'').trim()||null, customer_license:String(f.get('customer_license')||'').trim()||null, customer_cin:String(f.get('customer_cin')||'').trim()||null, start_at:start.toISOString(), end_at:end.toISOString(), daily_rate:Number(f.get('daily_rate')||0), rate_12h:Number(f.get('rate_12h')||0), total_amount:Number(f.get('total_amount')||0), deposit_amount:Number(f.get('deposit_amount')||0), payment_method:String(f.get('payment_method')||'').trim()||null, trip_from:String(f.get('trip_from')||'').trim()||null, trip_to:String(f.get('trip_to')||'').trim()||null, delivery_fee:Number(f.get('delivery_fee')||0), recovery_fee:Number(f.get('recovery_fee')||0), notes:String(f.get('notes')||'').trim()||null, days:Math.max(1,Math.ceil((end-start)/86400000)), status:'reserved' };
    if (!payload.customer_name || !payload.customer_phone || !Number.isFinite(payload.total_amount) || payload.total_amount < 0 || payload.deposit_amount < 0 || payload.deposit_amount > payload.total_amount) return notify('Vérifiez les informations client et les montants.', true);
    const conflict = reservations.find(r => r.id !== id && r.vehicle_id === payload.vehicle_id && r.status !== 'cancelled' && new Date(r.start_at) < end && new Date(r.end_at) > start);
    if (conflict) return notify(`Chevauchement avec la réservation ${conflict.reference}.`, true);
    const overlapQuery = await db.from('maintenance').select('id').eq('vehicle_id', payload.vehicle_id).lt('start_at', end.toISOString()).gt('end_at', start.toISOString()).limit(1);
    if (overlapQuery.error) return notify(`Vérification du calendrier impossible : ${overlapQuery.error.message}`, true);
    if ((overlapQuery.data || []).length) return notify('La période chevauche une indisponibilité déjà inscrite au calendrier.', true);
    busy = true;
    try {
      const result = id ? await db.rpc('partner_update_reservation', { p_reservation_id:id, p_payload:payload }) : await db.rpc('partner_create_reservation', { p_payload:payload });
      if (result.error) throw result.error;
      getDialog().close(); notify(id ? 'Réservation modifiée.' : 'Réservation créée et confirmée.'); await reload(); $('refresh-button')?.click();
    } catch (e) { notify(`Enregistrement impossible : ${e.message || e}`, true); } finally { busy = false; }
  }

  async function saveBlock(event) {
    event.preventDefault(); if (busy) return;
    const f = new FormData(event.currentTarget), start = new Date(`${f.get('start_at')}:00+03:00`), end = new Date(`${f.get('end_at')}:00+03:00`);
    if (!(start < end)) return notify('La date de fin doit être postérieure au début.', true);
    busy = true;
    try {
      const { error } = await db.from('maintenance').insert({vehicle_id:String(f.get('vehicle_id')),start_at:start.toISOString(),end_at:end.toISOString(),reason:String(f.get('reason')||'').trim()||'Période indisponible',maintenance_type:'general',maintenance_date:start.toISOString().slice(0,10),amount:0});
      if (error) throw error;
      getDialog().close(); notify('Période bloquée dans le calendrier.'); await reload(); $('refresh-button')?.click();
    } catch (e) { notify(`Blocage impossible : ${e.message || e}`, true); }
    finally { busy = false; }
  }
  function printContract(row) {
    const vehicle = vehicles.find(v => v.id === row.vehicle_id) || {};
    const assignedPartnerId = row.partner_user_id || null;
    const currentPartnerId = window.__partnerUserId || partnerUserId;
    if (assignedPartnerId && assignedPartnerId !== currentPartnerId) return notify('Cette réservation est attribuée à un autre partenaire. Son contrat n’est pas accessible depuis ce compte.', true);
    if (assignedPartnerId === currentPartnerId) {
      const templateKey = window.__partnerProfile?.partner_contract_template_key;
      if (!templateKey || !window.RentCarPartnerContracts) return notify('Le modèle contractuel de ce compte n’est pas disponible. Contactez le super-admin.', true);
      const grouped = row.booking_group_id ? reservations.filter(item => item.booking_group_id === row.booking_group_id) : [row];
      try {
        const html = window.RentCarPartnerContracts.renderHtml(templateKey, row, vehicle, grouped, { pageUrls: [] });
        const customWindow = window.open('', '_blank');
        if (!customWindow) return notify('Autorisez les fenêtres pop-up pour imprimer le contrat.', true);
        customWindow.document.open(); customWindow.document.write(html); customWindow.document.close();
        return;
      } catch (error) {
        notify('Le modèle privé n’est pas encore stocké; génération du contrat standard.', false);
      }
    }
    const date = value => value ? new Date(value).toLocaleString('fr-FR',{timeZone:'Indian/Antananarivo',dateStyle:'short',timeStyle:'short'}) : '—';
    const lessor = assignedPartnerId ? (window.__partnerProfile?.business_name || window.__partnerProfile?.display_name || 'Partenaire') : 'ANDRIANASOLO Volandrato — Rent Car Service';
    const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Contrat ${esc(row.reference)}</title><style>body{font:15px Arial,sans-serif;max-width:800px;margin:40px auto;color:#182b38}h1,h2{color:#0c3850}table{width:100%;border-collapse:collapse}td{padding:9px;border-bottom:1px solid #ddd}.sign{display:flex;justify-content:space-between;margin-top:60px}.sign div{width:42%;border-top:1px solid #333;padding-top:10px}.note{font-size:12px;color:#666}@media print{body{margin:15mm}}</style><h1>Contrat de location de véhicule</h1><p>Référence : <strong>${esc(row.reference)}</strong> · Émis le ${new Date().toLocaleDateString('fr-FR')}</p><h2>Loueur</h2><p>${esc(lessor)}</p><h2>Locataire</h2><p>${esc(row.customer_name)} · ${esc(row.customer_phone)}</p><h2>Véhicule et période</h2><table><tr><td>Véhicule</td><td>${esc(vehicle.name || vehicle.make || '')} ${esc(vehicle.model || '')}</td></tr><tr><td>Immatriculation</td><td>${esc(vehicle.registration_number || 'À compléter')}</td></tr><tr><td>Début</td><td>${date(row.start_at)}</td></tr><tr><td>Fin</td><td>${date(row.end_at)}</td></tr><tr><td>Trajet</td><td>${esc([row.trip_from,row.trip_to].filter(Boolean).join(' → ') || 'À préciser')}</td></tr><tr><td>Montant total</td><td>${money(row.total_amount)}</td></tr><tr><td>Payé / acompte</td><td>${money(row.deposit_amount)}</td></tr></table><h2>Conditions particulières</h2><p>Le locataire s’engage à utiliser le véhicule conformément à sa destination et à le restituer à la date convenue, dans l’état où il l’a reçu, sous réserve de l’usure normale. Tout dommage, retard ou frais imputable au locataire demeure à sa charge après justification. Le véhicule ne peut être sous-loué ni utilisé pour une activité illicite.</p><p class="note">Document généré pour impression à partir des informations de réservation. Vérifiez les identités, documents et conditions applicables avant signature. Ce document n’est pas signé électroniquement et ne constitue pas un avis juridique.</p><div class="sign"><div>Le locataire<br><br>Nom et signature</div><div>Le loueur<br><br>Nom et signature</div></div><script>window.print()<\/script></html>`;
    const w = window.open('','_blank'); if (!w) return notify('Autorisez les fenêtres pop-up pour imprimer le contrat.',true); w.document.write(html); w.document.close();
  }
  async function addPayment(row) { const amount = Number(prompt(`Solde actuel : ${money(Math.max(0, Number(row.total_amount||0)-Number(row.deposit_amount||0)))}\nMontant du paiement (Ar) :`, '0') || 0); if (!Number.isFinite(amount) || amount <= 0) return notify('Montant invalide.', true); const method = prompt('Mode de paiement :', 'Espèce') || 'Non précisé'; const { error } = await db.rpc('partner_add_payment', { p_reservation_id:row.id, p_amount:amount, p_method:method, p_due_date:null, p_note:`Référence ${row.reference}` }); if (error) return notify(`Paiement impossible : ${error.message}`, true); notify('Paiement enregistré.'); await reload(); $('refresh-button')?.click(); }
  async function sendSignatureLink(row) { const { data, error } = await db.rpc('partner_release_invoice_and_create_otp', { p_reservation_id:row.id }); if (error) return notify(`Lien impossible : ${error.message}`, true); const number=String(row.whatsapp_phone||row.customer_phone||'').replace(/[^\d]/g,''); const link=`${location.origin}${location.pathname.replace(/partner\.html$/,'invoice.html')}?reference=${encodeURIComponent(data.reference)}&phone=${encodeURIComponent(data.phone||row.customer_phone||'')}&otp=${encodeURIComponent(data.otp)}`; const text=`Bonjour ${row.customer_name}, voici le lien sécurisé pour vérifier et signer : ${link}`; if(number) window.open(`https://wa.me/${number}?text=${encodeURIComponent(text)}`,'_blank','noopener'); else await navigator.clipboard?.writeText(text); notify(number?'Lien préparé dans WhatsApp.':'Lien copié.'); }
  async function saveReturn(row, kind) { const details=prompt(kind==='restitution'?'Observations de restitution :':'Dégradation constatée / localisation :',''); if(details===null)return; const payload={recorded_at:new Date().toISOString(),degradation:details,km_return:Number(prompt('Kilométrage :','0')||0),fuel_return:prompt('Carburant au retour :','OK')||'OK',fuel_status:'ok',amount_due:Number(prompt('Montant dû / estimatif (Ar) :','0')||0),payment_status:'unpaid',customer_name:row.customer_name}; const {error}=await db.from('return_forms').insert({reservation_id:row.id,kind,payload}); if(error)return notify(`Fiche impossible : ${error.message}`,true); notify('Fiche enregistrée.'); }
  async function assignDriver(row) { const {data:drivers,error}=await db.rpc('list_partner_assignable_chauffeurs'); if(error||!drivers?.length)return notify(error?.message||'Aucun chauffeur disponible.',true); const pick=Number(prompt(drivers.map((d,i)=>`${i+1}. ${d.name}`).join('\n'),'1')||0)-1; const driver=drivers[pick]; if(!driver)return; const start=prompt('Début de mission ISO :',row.start_at), end=prompt('Fin de mission ISO (24 h maximum) :',row.end_at); const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''); const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)); const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join(''); const result=await db.rpc('assign_partner_chauffeur_mission',{p_chauffeur_id:driver.id,p_reservation_id:row.id,p_mission_type:'delivery_and_recovery',p_custom_delivery_cost:Number(row.delivery_fee||0),p_custom_recovery_cost:Number(row.recovery_fee||0),p_starts_at:new Date(start).toISOString(),p_expires_at:new Date(end).toISOString(),p_handover_address:row.customer_address||row.trip_from||null,p_notes:null,p_driver_instructions:'Vérifier CIN, permis et signature client.',p_acceptance_token_hash:hash,p_acceptance_expires_at:new Date(end).toISOString()}); if(result.error)return notify(`Affectation impossible : ${result.error.message}`,true); notify(`Mission attribuée à ${driver.name}.`); }
  async function bookingAction(event) {
    const button = event.target.closest('[data-partner-booking-action]'); if (!button || busy) return;
    const action = button.dataset.partnerBookingAction, row = reservations.find(r => r.id === button.dataset.id); if (!row) return;
    if (action === 'contract') return printContract(row);
    if (action === 'payment') return addPayment(row);
    if (action === 'signature') return sendSignatureLink(row);
    if (action === 'degradation' || action === 'restitution') return saveReturn(row, action);
    if (action === 'driver') return assignDriver(row);
    if (action === 'edit') return openForm('reservation',row);
    const map = {accept:'reserved',reject:'cancelled',cancel:'cancelled',complete:'completed'}, next = map[action];
    if (!next || !window.confirm(`${action === 'accept' ? 'Confirmer cette réservation ?' : action === 'complete' ? 'Marquer cette réservation comme terminée ?' : 'Annuler/refuser cette réservation ?'}`)) return;
    busy = true;
    try {
      let result;
      const payload = { vehicle_id: row.vehicle_id, customer_name: row.customer_name, customer_phone: row.customer_phone, whatsapp_phone: row.whatsapp_phone, customer_email: row.customer_email, customer_address: row.customer_address, customer_license: row.customer_license, customer_cin: row.customer_cin, start_at: row.start_at, end_at: row.end_at, daily_rate: row.daily_rate, rate_12h: row.rate_12h, total_amount: row.total_amount, deposit_amount: row.deposit_amount, payment_method: row.payment_method, trip_from: row.trip_from, trip_to: row.trip_to, delivery_fee: row.delivery_fee, recovery_fee: row.recovery_fee, notes: row.notes, days: row.days, status: next };
      result = await db.rpc('partner_update_reservation', { p_reservation_id: row.id, p_payload: payload });
      if (result.error) throw result.error;
      if (result.error) throw result.error;
      notify(action === 'accept' ? 'Réservation acceptée.' : action === 'reject' ? 'Demande refusée.' : 'Statut de réservation mis à jour.'); await reload(); $('refresh-button')?.click();
    } catch (e) { notify(`Mise à jour impossible : ${e.message || e}`, true); }
    finally { busy = false; }
  }
  async function reload() {
    const [{ data: authData }, v, r] = await Promise.all([db.auth.getUser(),db.from('vehicles').select('id,name,make,model,registration_number,owner_user_id,status,price_12h,price_24h').order('name').limit(500),db.from('reservations').select('id,reference,vehicle_id,partner_user_id,vehicles(name,make,model,registration_number),customer_name,customer_phone,whatsapp_phone,customer_email,customer_address,customer_license,customer_cin,start_at,end_at,days,total_amount,deposit_amount,daily_rate,rate_12h,payment_method,status,with_driver,trip_from,trip_to,delivery_fee,recovery_fee,notes,created_at').order('created_at',{ascending:false}).limit(1000)]);
    partnerUserId = authData?.user?.id || null;
    if (v.error || r.error) throw v.error || r.error;
    vehicles = v.data || []; const ids = new Set(vehicles.map(x=>x.id)); reservations = (r.data || []).filter(x=>ids.has(x.vehicle_id) || x.partner_user_id === partnerUserId);
    document.dispatchEvent(new CustomEvent('rentcar:partner-refreshed',{detail:{vehicles,reservations}}));
  }
  function initialize() {
    if (!db) return;
    $('partner-add-reservation')?.addEventListener('click',()=>openForm('reservation'));
    $('partner-add-block')?.addEventListener('click',()=>openForm('block'));
    $('reservations-table')?.addEventListener('click',bookingAction);
    $('calendar-view')?.addEventListener('click', async event => {
      const button = event.target.closest('[data-partner-remove-block]');
      if (!button || busy || !window.confirm('Supprimer ce blocage du calendrier ?')) return;
      busy = true;
      try { const { error } = await db.from('maintenance').delete().eq('id', button.dataset.partnerRemoveBlock); if (error) throw error; notify('Blocage supprimé.'); await reload(); $('refresh-button')?.click(); }
      catch (e) { notify(`Suppression impossible : ${e.message || e}`, true); }
      finally { busy = false; }
    });
    db.auth.onAuthStateChange((event,session)=>{ partnerUserId=session?.user?.id||null; if(session?.user) reload().catch(()=>{}); else { vehicles=[]; reservations=[]; } });
    document.addEventListener('rentcar:partner-refreshed',event=>{ vehicles=event.detail.vehicles||[]; reservations=event.detail.reservations||[]; });
    setTimeout(()=>{ if(document.querySelector('#app-view:not(.hidden)')) reload().catch(()=>{}); },1000);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',initialize,{once:true}); else initialize();
})();
