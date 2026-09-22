(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (value) => window.formatMGA ? window.formatMGA(value) : `${Number(value || 0).toLocaleString('fr-FR')} Ar`;
  const today = () => new Date().toLocaleDateString('fr-FR');
  const factAt = `Fait à Antananarivo, le ${today()}`;

  function addStyles() {
    if ($('admin-modal-styles')) return;
    const style = document.createElement('style'); style.id = 'admin-modal-styles';
    style.textContent = '.admin-modal-backdrop{position:fixed;inset:0;background:#0b1f3388;z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px}.admin-modal{background:#fff;color:#0b1f33;border-radius:16px;width:min(760px,100%);max-height:90vh;overflow:auto;padding:24px;box-shadow:0 20px 60px #0005}.admin-modal h2{margin-top:0}.admin-modal .modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}.admin-modal .field{margin-bottom:12px}.admin-modal .field label{display:block;color:#66788a;font-size:12px;font-weight:700;margin-bottom:6px}.admin-modal .field input,.admin-modal .field select,.admin-modal .field textarea{width:100%;padding:10px;border:1px solid #e4ebf1;border-radius:9px;font:inherit}.admin-modal .form-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.admin-modal .full{grid-column:1/-1}@media(max-width:600px){.admin-modal .form-grid{grid-template-columns:1fr}.admin-modal .full{grid-column:auto}}'; document.head.appendChild(style);
  }

  function closeReturnModal() { $('return-modal-backdrop')?.remove(); }

  function openReturnModal(id, kind) {
    const reservation = typeof reservations !== 'undefined' ? reservations.find(x => x.id === id) : null;
    if (!reservation) { alert('Réservation introuvable. Actualisez le tableau.'); return; }
    addStyles(); closeReturnModal();
    const isRest = kind === 'restitution';
    document.body.insertAdjacentHTML('beforeend', `<div id="return-modal-backdrop" class="admin-modal-backdrop"><div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="return-modal-title"><h2 id="return-modal-title">${isRest ? 'Fiche de restitution' : 'Fiche de dégradation'}</h2><p class="notice"><strong>Réservation :</strong> ${esc(reservation.reference)}<br><strong>Locataire :</strong> ${esc(reservation.customer_name)}<br><strong>Date du constat :</strong> ${today()} — ${new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</p><form id="return-modal-form"><input id="rm-reservation-id" type="hidden" value="${esc(reservation.id)}"><input id="rm-kind" type="hidden" value="${esc(kind)}"><div class="form-grid"><div class="field"><label>Kilométrage retour (km)</label><input id="rm-km" type="number" min="0" required></div><div class="field"><label>Nombre de clés restituées</label><input id="rm-keys" type="number" min="0" required></div><div class="field"><label>Niveau carburant retour</label><input id="rm-fuel" required placeholder="Ex. 3/4"></div><div class="field"><label>Montant à payer (Ar)</label><input id="rm-amount" type="number" min="0" value="0" required></div><div class="field full"><label>${isRest ? 'Observations de restitution' : 'Dégradation constatée'}</label><textarea id="rm-details" rows="5" placeholder="Détails, état, pièces ou justificatifs..."></textarea></div><div class="field"><label>Date d’échéance</label><input id="rm-due-date" type="date"></div><div class="field"><label>Statut du paiement</label><select id="rm-payment-status"><option value="unpaid">Reste à payer</option><option value="paid">Payé</option></select></div></div><div class="modal-actions"><button type="button" class="btn outline" id="rm-cancel">Annuler</button><button type="submit" class="btn primary">Enregistrer et générer le PDF</button></div></form><p id="rm-result" class="notice hidden"></p></div></div>`);
    $('rm-cancel').addEventListener('click', closeReturnModal);
    $('return-modal-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = { recorded_at: new Date().toISOString(), km_return: Number($('rm-km').value), keys_returned: Number($('rm-keys').value), fuel_return: $('rm-fuel').value.trim(), degradation: $('rm-details').value.trim(), amount_due: Number($('rm-amount').value || 0), due_date: $('rm-due-date').value || null, payment_status: $('rm-payment-status').value, customer_name: reservation.customer_name };
      const saved = await window.rentCarSupabase.from('return_forms').insert({reservation_id: reservation.id, kind, payload});
      if (saved.error) { $('rm-result').classList.remove('hidden'); $('rm-result').textContent = saved.error.message; return; }
      openReturnPdf(reservation, payload, kind); closeReturnModal();
    });
  }

  function openReturnPdf(reservation, payload, kind) {
    const title = kind === 'restitution' ? 'FICHE DE RESTITUTION DU VÉHICULE' : 'FICHE DE DÉGRADATION ET SOMMES DUES';
    const html = `<html><head><title>${title} ${esc(reservation.reference)}</title><style>body{font:14px Arial;line-height:1.5;padding:35px;color:#0b1f33;max-width:820px;margin:auto}h1{color:#0d5c8f;text-align:center;font-size:22px}h2{border-bottom:1px solid #ddd;padding-bottom:8px}.box{border:1px solid #ccd5dd;border-radius:8px;padding:14px;margin:12px 0}.total{font-size:20px;font-weight:bold;color:#a7700d}.sign{display:flex;justify-content:space-between;margin-top:90px}.line{border-bottom:1px solid #777;display:inline-block;min-width:210px}</style></head><body><h1>${title}</h1><p><strong>Référence :</strong> ${esc(reservation.reference)}<br><strong>Locataire :</strong> ${esc(reservation.customer_name)}<br><strong>Réservation :</strong> du ${new Date(reservation.start_at).toLocaleString('fr-FR')} au ${new Date(reservation.end_at).toLocaleString('fr-FR')}</p><h2>Constat enregistré</h2><div class="box"><p><strong>Date et heure :</strong> ${new Date(payload.recorded_at).toLocaleString('fr-FR')}</p><p><strong>Kilométrage retour :</strong> ${esc(payload.km_return)} km<br><strong>Clés restituées :</strong> ${esc(payload.keys_returned)}<br><strong>Niveau carburant retour :</strong> ${esc(payload.fuel_return)}</p><p><strong>${kind === 'restitution' ? 'Observations' : 'Dégradation constatée'} :</strong><br>${esc(payload.degradation || 'Aucune')}</p></div><p class="total">Montant à payer : ${money(payload.amount_due)}</p><p><strong>Date d’échéance :</strong> ${payload.due_date ? new Date(`${payload.due_date}T12:00:00`).toLocaleDateString('fr-FR') : '—'}<br><strong>Statut :</strong> ${payload.payment_status === 'paid' ? 'Payé' : 'Reste à payer'}</p><p>${factAt}</p><div class="sign"><span>LOCATAIRE : ${esc(reservation.customer_name)}<br><br>Mention : « Lu et approuvé »<br><br>Signature :</span><span>LOUEUR<br><br>Mention : « Lu et approuvé »<br><br>Signature :</span></div><script>window.print()<\/script></body></html>`;
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
  }

  function printDocumentEnhanced(id, kind) {
    const reservation = typeof reservations !== 'undefined' ? reservations.find(x => x.id === id) : null;
    const vehicle = reservation && typeof vehicles !== 'undefined' ? vehicles.find(x => x.id === reservation.vehicle_id) || {} : {};
    if (!reservation) return;
    const title = kind === 'invoice' ? 'FACTURE' : 'CONTRAT DE LOCATION';
    const paid = typeof paidFor === 'function' ? paidFor(reservation) : Number(reservation.deposit_amount || 0);
    const html = `<html><head><title>${title} ${esc(reservation.reference)}</title><style>body{font:14px Arial;line-height:1.5;padding:35px;color:#0b1f33;max-width:820px;margin:auto}h1{color:#0d5c8f;text-align:center}h2{border-bottom:1px solid #ddd;padding-bottom:8px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 25px}.total{font-size:20px;font-weight:bold;color:#a7700d}.sign{display:flex;justify-content:space-between;margin-top:90px}</style></head><body><h1>${title}</h1><p><strong>Référence :</strong> ${esc(reservation.reference)}<br><strong>Locataire :</strong> ${esc(reservation.customer_name)}<br><strong>Téléphone :</strong> ${esc(reservation.customer_phone)}</p><h2>Véhicule et période</h2><div class="grid"><div>Véhicule : ${esc(vehicle.name || vehicle.model || '—')}</div><div>Immatriculation : ${esc(vehicle.registration_number || '—')}</div><div>Départ : ${new Date(reservation.start_at).toLocaleString('fr-FR')}</div><div>Retour : ${new Date(reservation.end_at).toLocaleString('fr-FR')}</div><div>Total : ${money(reservation.total_amount)}</div><div>Acompte : ${money(paid)}</div></div><p class="total">Reste à payer : ${money(Math.max(0, Number(reservation.total_amount || 0) - paid))}</p>${kind === 'contract' ? '<h2>Conditions</h2><p>Le locataire s’engage à respecter les conditions de location, d’utilisation, de vérification et de restitution du véhicule. Les dommages, retards, pertes, carburant, clés et frais imputables restent dus selon les justificatifs disponibles.</p>' : '<p>Cette facture présente les montants enregistrés pour la réservation.</p>'}<p>${factAt}</p><div class="sign"><span>LOCATAIRE : ${esc(reservation.customer_name)}<br><br>Signature :</span><span>LOUEUR<br><br>Signature :</span></div><script>window.print()<\/script></body></html>`;
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
  }

  function addMaintenanceFields() {
    const form = $('maintenance-form');
    if (!form || $('m-incident-kind')) return;
    $('m-type')?.closest('.field')?.insertAdjacentHTML('afterend', '<div class="field"><label>Nature</label><select id="m-incident-kind"><option value="maintenance">Maintenance</option><option value="panne">Panne</option><option value="accident">Accident</option></select></div>');
    $('m-reason')?.closest('.field')?.insertAdjacentHTML('afterend', '<div class="field"><label>Client concerné</label><input id="m-client-name" placeholder="Nom du client"></div><div class="field"><label>Commande / référence</label><input id="m-work-order" placeholder="Bon ou commande"></div><div class="field"><label>Montant payé par le client (Ar)</label><input id="m-client-paid" type="number" min="0" value="0"></div><div class="field"><label>Reste à payer (Ar)</label><input id="m-remaining-due" type="number" min="0" value="0"></div><div class="field"><label>Date d’échéance</label><input id="m-due-date" type="date"></div><div class="field full"><label>Historique panne / accident</label><textarea id="m-incident-details" rows="3" placeholder="Chronologie, diagnostic, pièces et travaux..."></textarea></div>');
    form.addEventListener('submit', async (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      const payload = { vehicle_id: $('m-vehicle').value, maintenance_type: $('m-type').value, incident_kind: $('m-incident-kind').value, component: $('m-component').value, reason: $('m-reason').value, incident_details: $('m-incident-details').value, work_order_reference: $('m-work-order').value, client_name: $('m-client-name').value, amount: Number($('m-amount').value || 0), client_paid: Number($('m-client-paid').value || 0), remaining_due: Number($('m-remaining-due').value || 0), due_date: $('m-due-date').value || null, maintenance_date: $('m-date').value, odo_km: Number($('m-odo').value || 0), start_at: new Date($('m-start').value).toISOString(), end_at: new Date($('m-end').value).toISOString() };
      const {error} = await window.rentCarSupabase.from('maintenance').insert(payload);
      if (error) { alert(`Erreur : ${error.message}`); return; }
      form.reset(); form.classList.add('hidden'); if (typeof refreshAll === 'function') await refreshAll();
    }, true);
  }

  function renderFinance() {
    const grid = document.querySelector('#overview .grid');
    if (!grid || $('finance-summary')) return;
    grid.insertAdjacentHTML('afterend', '<div id="finance-summary" class="section card"><div class="section-head"><h2>Analyse du chiffre d’affaires</h2><span class="eyebrow">CA général · CA par voiture · maintenance</span></div><div id="finance-content"></div></div>');
    const confirmed = (typeof reservations !== 'undefined' ? reservations : []).filter(r => ['reserved','completed'].includes(r.status));
    const revenue = confirmed.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const maint = (typeof maintenances !== 'undefined' ? maintenances : []).reduce((sum, m) => sum + Number(m.amount || 0), 0);
    const byCar = {}; confirmed.forEach(r => { const name = r.vehicles?.name || 'Voiture'; byCar[name] = (byCar[name] || 0) + Number(r.total_amount || 0); });
    $('finance-content').innerHTML = `<p><strong>CA général confirmé :</strong> ${money(revenue)} &nbsp; <strong>Dépenses maintenance :</strong> ${money(maint)}</p><div class="table-wrap"><table class="table"><thead><tr><th>Voiture</th><th>CA généré</th></tr></thead><tbody>${Object.entries(byCar).map(([name, total]) => `<tr><td>${esc(name)}</td><td>${money(total)}</td></tr>`).join('') || '<tr><td colspan="2">Aucune réservation confirmée.</td></tr>'}</tbody></table></div>`;
  }

  function confirmedReservationsForAnalysis() {
    return (typeof reservations !== 'undefined' ? reservations : []).filter(r => ['reserved', 'completed'].includes(r.status));
  }

  function renderFinanceAnalysis() {
    const grid = document.querySelector('#overview .grid');
    if (!grid) return;
    let box = $('finance-analysis');
    if (!box) {
      grid.insertAdjacentHTML('afterend', `<div id="finance-analysis" class="section card"><div class="section-head"><div><h2>Mini-analyse financière</h2><p class="legend">Les montants par date et par voiture concernent les réservations confirmées ou terminées.</p></div><button class="btn outline" id="finance-reset">Réinitialiser</button></div><div class="filters"><label class="field"><span>Date de début</span><input id="finance-from" type="date"></label><label class="field"><span>Date de fin</span><input id="finance-to" type="date"></label><label class="field"><span>Voiture</span><select id="finance-vehicle"><option value="all">Toutes les voitures</option></select></label></div><div id="finance-metrics" class="grid"></div><div id="finance-breakdown" class="table-wrap"></div></div>`);
      box = $('finance-analysis');
      ['finance-from','finance-to','finance-vehicle'].forEach(id => $(id)?.addEventListener('change', renderFinanceAnalysis));
      $('finance-reset')?.addEventListener('click', () => { $('finance-from').value=''; $('finance-to').value=''; $('finance-vehicle').value='all'; renderFinanceAnalysis(); });
    }
    const allVehicles = typeof vehicles !== 'undefined' ? vehicles : [];
    const vehicleSelect = $('finance-vehicle');
    const currentValue = vehicleSelect?.value || 'all';
    if (vehicleSelect) vehicleSelect.innerHTML = '<option value="all">Toutes les voitures</option>' + allVehicles.map(v => `<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
    if (vehicleSelect && allVehicles.some(v => v.id === currentValue)) vehicleSelect.value = currentValue;
    const from = $('finance-from')?.value ? new Date(`${$('finance-from').value}T00:00:00`) : null;
    const to = $('finance-to')?.value ? new Date(`${$('finance-to').value}T23:59:59`) : null;
    const selectedVehicle = $('finance-vehicle')?.value || 'all';
    const rows = confirmedReservationsForAnalysis().filter(r => {
      const d = new Date(r.start_at);
      return (!from || d >= from) && (!to || d <= to) && (selectedVehicle === 'all' || r.vehicle_id === selectedVehicle);
    });
    const total = rows.reduce((a,r) => a + Number(r.total_amount || 0), 0);
    const collected = rows.reduce((a,r) => a + (typeof paidFor === 'function' ? paidFor(r) : Number(r.deposit_amount || 0)), 0);
    const maintenance = (typeof maintenances !== 'undefined' ? maintenances : []).filter(m => {
      const d = new Date(m.maintenance_date || m.start_at);
      return (!from || d >= from) && (!to || d <= to) && (selectedVehicle === 'all' || m.vehicle_id === selectedVehicle);
    }).reduce((a,m) => a + Number(m.amount || 0), 0);
    const historical = (typeof customers !== 'undefined' ? customers : []).reduce((a,c) => a + Number(c.historical_paid_total || 0), 0);
    $('finance-metrics').innerHTML = `<div class="card"><div class="metric-label">Réservations analysées</div><div class="metric">${rows.length}</div></div><div class="card"><div class="metric-label">CA facturé</div><div class="metric gold">${money(total)}</div></div><div class="card"><div class="metric-label">Encaissement actuel</div><div class="metric gold">${money(collected)}</div></div><div class="card"><div class="metric-label">Résultat après maintenance</div><div class="metric">${money(collected - maintenance)}</div></div>`;
    const grouped = {};
    rows.forEach(r => { const name = r.vehicles?.name || allVehicles.find(v => v.id === r.vehicle_id)?.name || 'Voiture inconnue'; const g = grouped[name] ||= {count:0,total:0,paid:0}; g.count++; g.total += Number(r.total_amount||0); g.paid += typeof paidFor === 'function' ? paidFor(r) : Number(r.deposit_amount||0); });
    $('finance-breakdown').innerHTML = `<p class="notice"><strong>CA historique global importé :</strong> ${money(historical)}. Il n’est pas ventilé par date ou voiture dans le fichier source.</p><table class="table"><thead><tr><th>Voiture</th><th>Locations</th><th>CA facturé</th><th>Payé</th><th>Reste</th></tr></thead><tbody>${Object.entries(grouped).sort((a,b)=>b[1].paid-a[1].paid).map(([name,g]) => `<tr><td><strong>${esc(name)}</strong></td><td>${g.count}</td><td>${money(g.total)}</td><td>${money(g.paid)}</td><td>${money(Math.max(0,g.total-g.paid))}</td></tr>`).join('') || '<tr><td colspan="5">Aucune donnée pour ces filtres.</td></tr>'}</tbody></table>`;
  }

  window.printReturnForm = openReturnModal;
  window.printDocument = printDocumentEnhanced;
  document.addEventListener('DOMContentLoaded', () => { addMaintenanceFields(); addStyles(); setTimeout(renderFinanceAnalysis, 1200); });
})();
