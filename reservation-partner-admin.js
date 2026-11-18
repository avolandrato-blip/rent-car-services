(() => {
  const db = window.rentCarSupabase;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let profiles = [];
  const todayMadagascar = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Indian/Antananarivo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const label = p => p.business_name || p.display_name || p.login_name || 'Partenaire';
  window.reservationPartnerLabel = id => {
    const profile = profiles.find(item => item.user_id === id);
    return profile ? esc(label(profile)) : (id ? 'Partenaire attribué' : 'Rent Car Service');
  };
  async function loadProfiles() {
    if (!db) return [];
    const { data, error } = await db.from('account_profiles')
      .select('user_id,display_name,login_name,business_name,business_address,business_phone,business_email,business_legal_id,partner_contract_template_key,is_active,access_ends_on,must_change_password')
      .eq('role', 'partner').eq('is_active', true).eq('must_change_password', false)
      .order('display_name', { ascending: true }).limit(500);
    if (error) throw error;
    profiles = (data || []).filter(p => p.partner_contract_template_key && p.access_ends_on && p.access_ends_on >= todayMadagascar());
    return profiles;
  }
  async function openAssignment(reservationId, currentId = '') {
    try { await loadProfiles(); }
    catch (error) { return alert(`Chargement des partenaires impossible : ${error.message}`); }
    document.getElementById('reservation-partner-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="reservation-partner-modal" class="admin-modal-backdrop"><div class="admin-modal" role="dialog" aria-modal="true"><h2>Attribuer le partenaire et le contrat</h2><p>Sans partenaire, le contrat Rent Car Service sera utilisé. Avec un partenaire, sa réservation lui sera visible et son modèle contractuel sera utilisé. Les réservations groupées reçoivent la même attribution.</p><div class="field"><label for="reservation-partner-select">Partenaire</label><select id="reservation-partner-select"><option value="">Aucun — Rent Car Service</option>${profiles.map(p => `<option value="${esc(p.user_id)}" ${p.user_id === currentId ? 'selected' : ''}>${esc(label(p))}${p.login_name ? ` (${esc(p.login_name)})` : ''}</option>`).join('')}</select></div>${!profiles.length ? '<p class="notice">Aucun partenaire actif avec accès validé et modèle contractuel personnalisé.</p>' : ''}<p id="reservation-partner-error" class="notice error" hidden></p><div class="modal-actions"><button type="button" class="btn outline" data-partner-modal-close>Annuler</button><button type="button" class="btn primary" data-partner-assignment-save="${esc(reservationId)}">Enregistrer l’attribution</button></div></div></div>`);
    const modal = document.getElementById('reservation-partner-modal');
    modal.querySelector('[data-partner-modal-close]').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', event => { if (event.target === modal) modal.remove(); });
    modal.querySelector('[data-partner-assignment-save]').addEventListener('click', async event => {
      const button = event.currentTarget;
      const errorNode = modal.querySelector('#reservation-partner-error');
      button.disabled = true; button.textContent = 'Enregistrement…'; errorNode.hidden = true;
      const partnerId = modal.querySelector('#reservation-partner-select').value || null;
      const { data, error } = await db.rpc('admin_assign_reservation_partner', { p_reservation_id: reservationId, p_partner_user_id: partnerId });
      if (error || !(Number(data) > 0)) {
        errorNode.textContent = error?.message || 'Aucune réservation n’a été modifiée.';
        errorNode.hidden = false; button.disabled = false; button.textContent = 'Réessayer'; return;
      }
      modal.remove();
      alert(`Attribution enregistrée pour ${data} période(s).`);
      if (typeof window.refreshAll === 'function') await window.refreshAll();
      else document.dispatchEvent(new CustomEvent('rentcar:reservation-partner-updated'));
    });
  }
  window.openReservationPartnerAssignment = openAssignment;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => loadProfiles().catch(() => {}), { once: true });
  else loadProfiles().catch(() => {});
})();
