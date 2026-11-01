(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = { new: 'Nouvelle', contacted: 'Contactée', accepted: 'Acceptée', rejected: 'Refusée', archived: 'Archivée' };
  window.loadPartnerRequests = async () => {
    const host = $('partner-requests-table'); if (!host || !window.rentCarSupabase) return;
    const { data, error } = await window.rentCarSupabase.from('partner_requests').select('id,request_type,payload,status,created_at,updated_at').order('created_at', { ascending: false }).limit(200);
    if (error) { host.innerHTML = `<div class="notice">Impossible de charger les demandes : ${esc(error.message)}</div>`; return; }
    host.innerHTML = (data || []).map(row => { const p = row.payload || {}; const vehicle = row.request_type === 'vehicle_owner'; const summary = vehicle ? `${p.make || ''} ${p.model || ''} · ${p.seats || '—'} places · ${p.transmission || '—'} · ${p.fuel || '—'}` : `${p.company_name || 'Entreprise'} · ${p.car_type || '—'} · ${p.vehicle_count || '—'} voiture(s) · ${p.duration_days || '—'} jour(s) · ${p.route || '—'}`; return `<article class="card partner-request-admin"><div class="section-head"><div><strong>${vehicle ? 'Proposition de véhicule (P2P)' : 'Demande entreprise (B2B)'}</strong><br><small>${new Date(row.created_at).toLocaleString('fr-FR')} · ${esc(p.contact_name || '—')} · ${esc(p.phone || '—')}</small></div><select onchange="window.updatePartnerRequest('${row.id}', this.value)">${Object.entries(labels).map(([key,label]) => `<option value="${key}" ${row.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div><p><strong>${esc(summary)}</strong><br>${esc(p.email || '')}<br>${esc(p.message || '')}</p></article>`; }).join('') || '<div class="empty">Aucune demande partenaire.</div>';
  };
  window.updatePartnerRequest = async (id, status) => { const { error } = await window.rentCarSupabase.from('partner_requests').update({ status, updated_at: new Date().toISOString() }).eq('id', id); if (error) alert(error.message); else window.loadPartnerRequests(); };
  document.addEventListener('DOMContentLoaded', () => setTimeout(window.loadPartnerRequests, 700));
})();
