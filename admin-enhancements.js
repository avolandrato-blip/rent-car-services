(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = (value) => window.formatMGA ? window.formatMGA(value) : `${Number(value || 0).toLocaleString('fr-FR')} Ar`;

  function openReturnInvoice(reservation, payload) {
    const html = `<html><head><title>Facture restitution ${esc(reservation.reference)}</title><style>body{font:15px Arial;padding:35px;color:#0b1f33;max-width:820px;margin:auto;line-height:1.5}h1{color:#0d5c8f}table{width:100%;border-collapse:collapse}td{padding:10px;border-bottom:1px solid #ddd}.total{font-size:22px;font-weight:bold;color:#a7700d}</style></head><body><h1>RENT CAR SERVICES</h1><p>67 Ha Nord Ouest, Parking FJKM SALEMA<br>034 91 207 26</p><h2>FACTURE DE RESTITUTION / DÉGRADATION</h2><p><strong>Réservation :</strong> ${esc(reservation.reference)}<br><strong>Client :</strong> ${esc(reservation.customer_name)}<br><strong>Date et heure du constat :</strong> ${new Date(payload.recorded_at).toLocaleString('fr-FR')}</p><table><tr><td>Kilométrage retour</td><td>${esc(payload.km_return)} km</td></tr><tr><td>Clés restituées</td><td>${esc(payload.keys_returned)}</td></tr><tr><td>Carburant retour</td><td>${esc(payload.fuel_return)}</td></tr><tr><td>Dégradation constatée</td><td>${esc(payload.degradation || 'Aucune')}</td></tr></table><p class="total">Montant à payer : ${money(payload.amount_due)}</p><p>Cette facture est établie sur la base du constat enregistré et des justificatifs disponibles.</p><script>window.print()<\/script></body></html>`;
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
  }

  function addMaintenanceFields() {
    const form = $('maintenance-form');
    if (!form || $('m-incident-kind')) return;
    $('m-type')?.closest('.field')?.insertAdjacentHTML('afterend', '<div class="field"><label>Nature</label><select id="m-incident-kind"><option value="maintenance">Maintenance</option><option value="panne">Panne</option><option value="accident">Accident</option></select></div>');
    $('m-reason')?.closest('.field')?.insertAdjacentHTML('afterend', '<div class="field"><label>Client concerné</label><input id="m-client-name" placeholder="Nom du client"></div><div class="field"><label>Commande / référence</label><input id="m-work-order" placeholder="Bon ou commande"></div><div class="field"><label>Montant payé par le client (Ar)</label><input id="m-client-paid" type="number" min="0" value="0"></div><div class="field"><label>Reste à payer (Ar)</label><input id="m-remaining-due" type="number" min="0" value="0"></div><div class="field"><label>Date d’échéance</label><input id="m-due-date" type="date"></div><div class="field full"><label>Historique panne / accident</label><textarea id="m-incident-details" rows="3" placeholder="Chronologie, diagnostic, pièces et travaux..."></textarea></div>');
    form.addEventListener('submit', (event) => saveMaintenanceEnhanced(event), true);
  }

  async function saveMaintenanceEnhanced(event) {
    event.preventDefault(); event.stopImmediatePropagation();
    const db = window.rentCarSupabase;
    const payload = { vehicle_id: $('m-vehicle').value, maintenance_type: $('m-type').value, incident_kind: $('m-incident-kind').value, component: $('m-component').value, reason: $('m-reason').value, incident_details: $('m-incident-details').value, work_order_reference: $('m-work-order').value, client_name: $('m-client-name').value, amount: Number($('m-amount').value || 0), client_paid: Number($('m-client-paid').value || 0), remaining_due: Number($('m-remaining-due').value || 0), due_date: $('m-due-date').value || null, maintenance_date: $('m-date').value, odo_km: Number($('m-odo').value || 0), start_at: new Date($('m-start').value).toISOString(), end_at: new Date($('m-end').value).toISOString() };
    const {error} = await db.from('maintenance').insert(payload);
    if (error) { alert(`Erreur : ${error.message}`); return; }
    $('maintenance-form').reset(); $('maintenance-form').classList.add('hidden');
    if (typeof refreshAll === 'function') await refreshAll();
  }

  function addReturnAdminPanel() {
    const section = $('maintenance');
    if (!section || $('admin-return-panel')) return;
    section.querySelector('.card')?.insertAdjacentHTML('beforeend', `<div id="admin-return-panel" class="section card"><div class="section-head"><h2>Constat de restitution / dégradation</h2></div><p class="notice">La date et l’heure sont générées au clic sur Enregistrer. Les données alimentent la facture finale.</p><form id="admin-return-form" class="form-grid"><div class="field"><label>Référence réservation</label><input id="ar-reference" required placeholder="RCS-..."></div><div class="field"><label>Type</label><select id="ar-kind"><option value="restitution">Restitution</option><option value="degradation">Dégradation</option></select></div><div class="field"><label>Kilométrage retour</label><input id="ar-km" type="number" min="0" required></div><div class="field"><label>Clés restituées</label><input id="ar-keys" type="number" min="0" required></div><div class="field"><label>Carburant retour</label><input id="ar-fuel" required></div><div class="field"><label>Montant à payer</label><input id="ar-amount" type="number" min="0" value="0" required></div><div class="field full"><label>Dégradation constatée</label><textarea id="ar-details" rows="3"></textarea></div><div class="field full"><button class="btn primary">Enregistrer le constat et générer la facture</button></div></form><p id="ar-result" class="notice hidden"></p></div>`);
    $('admin-return-form').addEventListener('submit', async (event) => {
      event.preventDefault(); const result = $('ar-result'); const ref = $('ar-reference').value.trim();
      const {data: reservation, error} = await window.rentCarSupabase.from('reservations').select('id,reference,customer_name,total_amount,deposit_amount,whatsapp_phone,customer_phone').eq('reference', ref).maybeSingle();
      if (error || !reservation) { result.classList.remove('hidden'); result.textContent = 'Référence introuvable.'; return; }
      const amount = Number($('ar-amount').value || 0); const payload = { recorded_at: new Date().toISOString(), km_return: Number($('ar-km').value), keys_returned: Number($('ar-keys').value), fuel_return: $('ar-fuel').value, degradation: $('ar-details').value, amount_due: amount, customer_name: reservation.customer_name, invoice_status: amount > 0 ? 'unpaid' : 'paid' };
      const saved = await window.rentCarSupabase.from('return_forms').insert({reservation_id: reservation.id, kind: $('ar-kind').value, payload});
      if (saved.error) { result.classList.remove('hidden'); result.textContent = saved.error.message; return; }
      result.classList.remove('hidden'); result.textContent = `Constat enregistré le ${new Date().toLocaleString('fr-FR')}. Montant à facturer : ${money(amount)}.`;
      openReturnInvoice(reservation, payload);
      $('admin-return-form').reset();
    });
  }

  function renderFinance() {
    const grid = document.querySelector('#overview .grid');
    if (!grid || $('finance-summary')) return;
    grid.insertAdjacentHTML('afterend', '<div id="finance-summary" class="section card"><div class="section-head"><h2>Analyse du chiffre d’affaires</h2><span class="eyebrow">CA général · CA par voiture · maintenance</span></div><div id="finance-content"></div></div>');
    const confirmed = (typeof reservations !== 'undefined' ? reservations : []).filter(r => ['reserved','completed'].includes(r.status));
    const revenue = confirmed.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
    const maint = (typeof maintenances !== 'undefined' ? maintenances : []).reduce((sum, m) => sum + Number(m.amount || 0), 0);
    const byCar = {};
    confirmed.forEach(r => { const name = r.vehicles?.name || r.vehicle_name || 'Voiture'; byCar[name] = (byCar[name] || 0) + Number(r.total_amount || 0); });
    $('finance-content').innerHTML = `<p><strong>CA général confirmé :</strong> ${money(revenue)} &nbsp; <strong>Dépenses maintenance :</strong> ${money(maint)}</p><div class="table-wrap"><table class="table"><thead><tr><th>Voiture</th><th>CA généré</th></tr></thead><tbody>${Object.entries(byCar).map(([name, total]) => `<tr><td>${esc(name)}</td><td>${money(total)}</td></tr>`).join('') || '<tr><td colspan="2">Aucune réservation confirmée.</td></tr>'}</tbody></table></div>`;
  }

  document.addEventListener('DOMContentLoaded', () => { addMaintenanceFields(); addReturnAdminPanel(); setTimeout(renderFinance, 1200); });
})();
