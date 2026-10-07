(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const money = value => window.formatMGA ? window.formatMGA(value) : `${Number(value || 0).toLocaleString('fr-FR')} Ar`;

  function addStyles() {
    if ($('admin-operations-styles')) return;
    const style = document.createElement('style');
    style.id = 'admin-operations-styles';
    style.textContent = '.admin-alerts{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:20px}.admin-alert{border-left:4px solid #d9a441;background:#fffdf7;border-radius:10px;padding:12px}.admin-alert strong{display:block;margin-bottom:4px}.admin-alert small{color:#66788a}.admin-preview-content{background:#f8fafc;border:1px solid #e4ebf1;border-radius:10px;padding:16px;line-height:1.6}.admin-preview-content h3{margin:0 0 12px;color:#0d5c8f}.reservation-search{max-width:520px;margin:0 0 14px}.reservation-search input{width:100%;padding:11px;border:1px solid #e4ebf1;border-radius:9px;font:inherit}@media(max-width:1000px){.admin-alerts{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.admin-alerts{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function renderAlerts() {
    const grid = document.querySelector('#overview .grid');
    if (!grid) return;
    let box = $('admin-alerts');
    if (!box) { grid.insertAdjacentHTML('afterend', '<div id="admin-alerts" class="admin-alerts"></div>'); box = $('admin-alerts'); }
    const now = Date.now();
    const list = typeof reservations !== 'undefined' ? reservations : [];
    const maint = typeof maintenances !== 'undefined' ? maintenances : [];
    const paid = r => typeof window.paidFor === 'function' ? window.paidFor(r) : Number(r.deposit_amount || 0);
    const upcoming = list.filter(r => ['reserved','pre_reserved'].includes(r.status) && new Date(r.start_at).getTime() >= now && new Date(r.start_at).getTime() <= now + 48 * 3600000);
    const returns = list.filter(r => r.status === 'reserved' && new Date(r.end_at).getTime() >= now && new Date(r.end_at).getTime() <= now + 48 * 3600000);
    const unpaid = list.filter(r => ['reserved','completed'].includes(r.status) && Number(r.total_amount || 0) - paid(r) > 0);
    const scheduled = maint.filter(m => new Date(m.start_at).getTime() >= now && new Date(m.start_at).getTime() <= now + 7 * 86400000);
    const card = (title, count, detail, color) => `<div class="admin-alert" style="border-left-color:${color}"><strong>${title} : ${count}</strong><small>${detail}</small></div>`;
    box.innerHTML = card('Départs dans 48 h', upcoming.length, upcoming.length ? 'Vérifier les paiements et préparer les véhicules.' : 'Aucun départ imminent.', '#0d5c8f') + card('Retours dans 48 h', returns.length, returns.length ? 'Préparer la restitution et le contrôle.' : 'Aucun retour imminent.', '#d9a441') + card('Soldes à encaisser', unpaid.length, unpaid.length ? 'Enregistrer les paiements restants.' : 'Tous les soldes sont à jour.', '#b42318') + card('Maintenances prévues', scheduled.length, scheduled.length ? 'Vérifier les périodes bloquées.' : 'Aucune maintenance dans les 7 jours.', '#16803c');
  }

  function setupSearch() {
    const table = $('reservations-table');
    if (!table || $('reservation-search')) return;
    table.insertAdjacentHTML('beforebegin', '<div class="reservation-search"><input id="reservation-search" type="search" placeholder="Rechercher une référence, un client, un téléphone ou une voiture…" aria-label="Rechercher une réservation"></div>');
    $('reservation-search').addEventListener('input', () => {
      const query = $('reservation-search').value.trim().toLocaleLowerCase('fr');
      table.querySelectorAll('tbody tr').forEach(row => { row.hidden = Boolean(query && !row.textContent.toLocaleLowerCase('fr').includes(query)); });
    });
  }

  function previewDocument(id, kind) {
    const reservation = typeof reservations !== 'undefined' ? reservations.find(x => x.id === id) : null;
    const vehicle = reservation && typeof vehicles !== 'undefined' ? vehicles.find(x => x.id === reservation.vehicle_id) || {} : {};
    if (!reservation) return alert('Réservation introuvable. Actualisez le tableau.');
    $('admin-preview-backdrop')?.remove();
    const paid = typeof window.paidFor === 'function' ? window.paidFor(reservation) : Number(reservation.deposit_amount || 0);
    const title = kind === 'invoice' ? 'Prévisualisation de la facture' : 'Prévisualisation du contrat';
    document.body.insertAdjacentHTML('beforeend', `<div id="admin-preview-backdrop" class="admin-modal-backdrop"><div class="admin-modal" role="dialog" aria-modal="true"><h2>${title}</h2><div class="admin-preview-content"><h3>Rent Car Service</h3><p><strong>Référence :</strong> ${esc(reservation.reference)}<br><strong>Client :</strong> ${esc(reservation.customer_name)}<br><strong>Téléphone :</strong> ${esc(reservation.customer_phone || '—')}<br><strong>Véhicule :</strong> ${esc(vehicle.name || vehicle.model || '—')}<br><strong>Période :</strong> ${new Date(reservation.start_at).toLocaleString('fr-FR')} → ${new Date(reservation.end_at).toLocaleString('fr-FR')}<br><strong>Formule :</strong> ${reservation.with_driver ? 'Avec chauffeur' : 'Sans chauffeur'}<br><strong>Total :</strong> ${money(reservation.total_amount)}<br><strong>Acompte payé :</strong> ${money(paid)}<br><strong>Reste à payer :</strong> ${money(Math.max(0, Number(reservation.total_amount || 0) - paid))}</p>${kind === 'contract' ? '<p>Le contrat complet comprendra les conditions de location, les informations CIN et permis, les conditions de restitution et les signatures.</p>' : '<p>La facture complète reprendra le détail financier enregistré pour cette réservation.</p>'}</div><div class="modal-actions"><button type="button" class="btn outline" onclick="document.getElementById(\'admin-preview-backdrop\')?.remove()">Fermer</button><button type="button" class="btn primary" onclick="document.getElementById(\'admin-preview-backdrop\')?.remove();window.printDocument(\'${esc(id)}\',\'${esc(kind)}\')">Imprimer / générer</button></div></div></div>`);
  }

  function refreshEnhancements() { setupSearch(); renderAlerts(); }
  window.previewDocument = previewDocument;
  document.addEventListener('DOMContentLoaded', () => { addStyles(); setTimeout(refreshEnhancements, 300); });
  const originalRefreshAll = window.refreshAll;
  if (typeof originalRefreshAll === 'function' && !originalRefreshAll.__operationsWrapped) {
    const wrapped = async function (...args) { const result = await originalRefreshAll.apply(this, args); refreshEnhancements(); return result; };
    wrapped.__operationsWrapped = true;
    window.refreshAll = wrapped;
  }
})();
