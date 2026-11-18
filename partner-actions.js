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
      host.innerHTML = `<h2>${row ? 'Modifier la réservation' : 'Nouvelle réservation'}</h2><p>Cette réservation concerne uniquement une voiture qui vous est attribuée.</p><form id="partner-booking-form" class="form-grid"><input type="hidden" name="id" value="${esc(row?.id || '')}"><label>Voiture<select name="vehicle_id" required>${requireVehicleOptions(vId)}</select></label><label>Nom du client<input name="customer_name" maxlength="160" required value="${esc(row?.customer_name || '')}"></label><label>Téléphone<input name="customer_phone" maxlength="50" required value="${esc(row?.customer_phone || '')}"></label><label>Début<input type="datetime-local" name="start_at" required value="${esc(start)}"></label><label>Fin<input type="datetime-local" name="end_at" required value="${esc(end)}"></label><label>Tarif journalier (Ar)<input type="number" min="0" name="daily_rate" required value="${esc(row?.daily_rate ?? '')}"></label><label>Montant total (Ar)<input type="number" min="0" name="total_amount" required value="${esc(row?.total_amount ?? '')}"></label><div class="field full"><button class="btn primary" type="submit">${row ? 'Enregistrer' : 'Créer la réservation'}</button></div></form>`;
      $('partner-booking-form').addEventListener('submit', saveBooking);
    } else {
      host.innerHTML = `<h2>Bloquer une période</h2><p>Le blocage apparaîtra au calendrier de disponibilité de votre voiture.</p><form id="partner-block-form" class="form-grid"><label>Voiture<select name="vehicle_id" required>${requireVehicleOptions()}</select></label><label>Début<input type="datetime-local" name="start_at" required></label><label>Fin<input type="datetime-local" name="end_at" required></label><label>Motif<input name="reason" maxlength="160" placeholder="Indisponibilité / entretien"></label><div class="field full"><button class="btn primary" type="submit">Enregistrer le blocage</button></div></form>`;
      $('partner-block-form').addEventListener('submit', saveBlock);
    }
    dlg.showModal();
  }
  async function saveBooking(event) {
    event.preventDefault(); if (busy) return;
    const f = new FormData(event.currentTarget), id = f.get('id'), start = new Date(`${f.get('start_at')}:00+03:00`), end = new Date(`${f.get('end_at')}:00+03:00`);
    if (!(start < end)) return notify('La date de fin doit être postérieure au début.', true);
    const existing = reservations.find(r => r.id === id);
    const payload = { vehicle_id: String(f.get('vehicle_id')), customer_name: String(f.get('customer_name')).trim(), customer_phone: String(f.get('customer_phone')).trim(), start_at: start.toISOString(), end_at: end.toISOString(), daily_rate: Number(f.get('daily_rate')), total_amount: Number(f.get('total_amount')), days: Math.max(1, Math.ceil((end-start)/86400000)), status: existing?.status || 'reserved', ...(id ? {} : {reference:`RCS-P-${crypto.randomUUID().slice(0,8).toUpperCase()}`, customer_id:null, deposit_amount:0, payment_status:'pending', with_driver:false}) };
    if (!payload.customer_name || !payload.customer_phone || !Number.isFinite(payload.total_amount) || payload.total_amount < 0 || payload.daily_rate < 0) return notify('Vérifiez les informations et les montants.', true);
    const conflict = reservations.find(r => r.id !== id && r.vehicle_id === payload.vehicle_id && r.status !== 'cancelled' && new Date(r.start_at) < end && new Date(r.end_at) > start);
    if (conflict) return notify(`Chevauchement avec la réservation ${conflict.reference}.`, true);
    const overlapQuery = await db.from('maintenance').select('id').eq('vehicle_id', payload.vehicle_id).lt('start_at', end.toISOString()).gt('end_at', start.toISOString()).limit(1);
    if (overlapQuery.error) return notify(`Vérification du calendrier impossible : ${overlapQuery.error.message}`, true);
    if ((overlapQuery.data || []).length) return notify('La période chevauche une indisponibilité déjà inscrite au calendrier.', true);
    busy = true;
    try {
      const result = id ? await db.from('reservations').update(payload).eq('id',id).eq('vehicle_id',existing.vehicle_id) : await db.from('reservations').insert(payload);
      if (result.error) throw result.error;
      getDialog().close(); notify(id ? 'Réservation modifiée.' : 'Réservation créée et confirmée.'); await reload(); $('refresh-button')?.click();
    } catch (e) { notify(`Enregistrement impossible : ${e.message || e}`, true); }
    finally { busy = false; }
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
      const html = window.RentCarPartnerContracts.renderHtml(templateKey, row, vehicle, grouped);
      const customWindow = window.open('', '_blank');
      if (!customWindow) return notify('Autorisez les fenêtres pop-up pour imprimer le contrat.', true);
      customWindow.document.open(); customWindow.document.write(html); customWindow.document.close();
      return;
    }
    const date = value => value ? new Date(value).toLocaleString('fr-FR',{timeZone:'Indian/Antananarivo',dateStyle:'short',timeStyle:'short'}) : '—';
    const lessor = assignedPartnerId ? (window.__partnerProfile?.business_name || window.__partnerProfile?.display_name || 'Partenaire') : 'ANDRIANASOLO Volandrato — Rent Car Service';
    const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Contrat ${esc(row.reference)}</title><style>body{font:15px Arial,sans-serif;max-width:800px;margin:40px auto;color:#182b38}h1,h2{color:#0c3850}table{width:100%;border-collapse:collapse}td{padding:9px;border-bottom:1px solid #ddd}.sign{display:flex;justify-content:space-between;margin-top:60px}.sign div{width:42%;border-top:1px solid #333;padding-top:10px}.note{font-size:12px;color:#666}@media print{body{margin:15mm}}</style><h1>Contrat de location de véhicule</h1><p>Référence : <strong>${esc(row.reference)}</strong> · Émis le ${new Date().toLocaleDateString('fr-FR')}</p><h2>Loueur</h2><p>${esc(lessor)}</p><h2>Locataire</h2><p>${esc(row.customer_name)} · ${esc(row.customer_phone)}</p><h2>Véhicule et période</h2><table><tr><td>Véhicule</td><td>${esc(vehicle.name || vehicle.make || '')} ${esc(vehicle.model || '')}</td></tr><tr><td>Immatriculation</td><td>${esc(vehicle.registration_number || 'À compléter')}</td></tr><tr><td>Début</td><td>${date(row.start_at)}</td></tr><tr><td>Fin</td><td>${date(row.end_at)}</td></tr><tr><td>Trajet</td><td>${esc([row.trip_from,row.trip_to].filter(Boolean).join(' → ') || 'À préciser')}</td></tr><tr><td>Montant total</td><td>${money(row.total_amount)}</td></tr><tr><td>Payé / acompte</td><td>${money(row.deposit_amount)}</td></tr></table><h2>Conditions particulières</h2><p>Le locataire s’engage à utiliser le véhicule conformément à sa destination et à le restituer à la date convenue, dans l’état où il l’a reçu, sous réserve de l’usure normale. Tout dommage, retard ou frais imputable au locataire demeure à sa charge après justification. Le véhicule ne peut être sous-loué ni utilisé pour une activité illicite.</p><p class="note">Document généré pour impression à partir des informations de réservation. Vérifiez les identités, documents et conditions applicables avant signature. Ce document n’est pas signé électroniquement et ne constitue pas un avis juridique.</p><div class="sign"><div>Le locataire<br><br>Nom et signature</div><div>Le loueur<br><br>Nom et signature</div></div><script>window.print()<\/script></html>`;
    const w = window.open('','_blank'); if (!w) return notify('Autorisez les fenêtres pop-up pour imprimer le contrat.',true); w.document.write(html); w.document.close();
  }
  async function bookingAction(event) {
    const button = event.target.closest('[data-partner-booking-action]'); if (!button || busy) return;
    const action = button.dataset.partnerBookingAction, row = reservations.find(r => r.id === button.dataset.id); if (!row) return;
    if (action === 'contract') return printContract(row);
    if (action === 'edit') return openForm('reservation',row);
    const map = {accept:'reserved',reject:'cancelled',cancel:'cancelled',complete:'completed'}, next = map[action];
    if (!next || !window.confirm(`${action === 'accept' ? 'Confirmer cette réservation ?' : action === 'complete' ? 'Marquer cette réservation comme terminée ?' : 'Annuler/refuser cette réservation ?'}`)) return;
    busy = true;
    try {
      let result;
      if (row.partner_user_id && row.partner_user_id === partnerUserId) {
        result = await db.rpc('partner_update_assigned_reservation', { p_reservation_id: row.id, p_status: next });
      } else {
        result = await db.from('reservations').update({status:next}).eq('id',row.id).eq('status',row.status);
      }
      if (result.error) throw result.error;
      if (typeof result.data === 'number' && result.data < 1) throw new Error('Aucune période de la réservation n’a été mise à jour.');
      notify(action === 'accept' ? 'Réservation acceptée.' : action === 'reject' ? 'Demande refusée.' : 'Statut de réservation mis à jour.'); await reload(); $('refresh-button')?.click();
    } catch (e) { notify(`Mise à jour impossible : ${e.message || e}`, true); }
    finally { busy = false; }
  }
  async function reload() {
    const [{ data: authData }, v, r] = await Promise.all([db.auth.getUser(),db.from('vehicles').select('id,name,make,model,registration_number,owner_user_id,status,price_12h,price_24h').order('name').limit(500),db.from('reservations').select('id,reference,vehicle_id,partner_user_id,vehicles(name,make,model,registration_number),customer_name,customer_phone,start_at,end_at,days,total_amount,deposit_amount,daily_rate,status,with_driver,trip_from,trip_to,created_at').order('created_at',{ascending:false}).limit(1000)]);
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
