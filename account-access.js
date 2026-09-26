(() => {
  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function madagascarToday() {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Indian/Antananarivo', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type)?.value || '';
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function showLoginError(message) {
    const box = $('login-error');
    if (box) box.textContent = message;
  }

  function applyRoleUi(profile) {
    const isSuperAdmin = profile.role === 'super_admin';
    document.querySelectorAll('[data-superadmin-only]').forEach(element => element.classList.toggle('hidden', !isSuperAdmin));
    document.querySelectorAll('[data-partner-hidden]').forEach(element => element.classList.toggle('hidden', isSuperAdmin));
    const initialTab = isSuperAdmin ? 'overview' : 'reservations';
    document.querySelectorAll('.nav button').forEach(button => button.classList.toggle('active', button.dataset.tab === initialTab));
    document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.id === initialTab));
    if ($('page-title')) $('page-title').textContent = document.querySelector(`.nav button[data-tab="${initialTab}"]`)?.textContent || 'Réservations';
  }

  async function loadProfiles() {
    const target = $('account-profiles-table');
    if (!target || window.currentAccountProfile?.role !== 'super_admin') return;
    const { data, error } = await db.from('account_profiles')
      .select('user_id,email,role,display_name,business_name,is_active,access_ends_on')
      .order('role').order('email');
    if (error) {
      target.textContent = `Impossible de charger les comptes : ${error.message}`;
      return;
    }
    target.innerHTML = (data || []).map(profile => `<tr>
      <td>${escapeHtml(profile.email)}</td><td>${escapeHtml(profile.display_name || profile.business_name || '—')}</td>
      <td>${profile.role === 'super_admin' ? 'Super-admin' : 'Prestataire'}</td>
      <td>${escapeHtml(profile.access_ends_on || 'Sans échéance')}</td>
      <td>${profile.is_active ? 'Actif' : 'Désactivé'}</td>
      <td>${profile.role === 'partner' ? `<button class="btn outline" type="button" data-toggle-partner="${escapeHtml(profile.user_id)}" data-next-active="${profile.is_active ? 'false' : 'true'}">${profile.is_active ? 'Désactiver' : 'Réactiver'}</button>` : '—'}</td>
    </tr>`).join('') || '<tr><td colspan="6">Aucun compte.</td></tr>';
  }

  async function setPartnerActive(userId, active) {
    const { error } = await db.from('account_profiles').update({ is_active: active, updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('role', 'partner');
    if (error) return alert(`Modification impossible : ${error.message}`);
    await loadProfiles();
  }

  async function addPartner(event) {
    event.preventDefault();
    const result = $('partner-account-result');
    const submit = $('partner-account-submit');
    if (result) result.textContent = 'Enregistrement…';
    if (submit) submit.disabled = true;
    try {
      const { data, error } = await db.rpc('superadmin_assign_partner', {
        p_email: $('partner-email').value.trim(),
        p_display_name: $('partner-name').value.trim() || null,
        p_business_name: $('partner-business').value.trim() || null,
        p_business_address: $('partner-address').value.trim() || null,
        p_business_phone: $('partner-phone').value.trim() || null,
        p_business_email: $('partner-business-email').value.trim() || null,
        p_business_legal_id: $('partner-legal-id').value.trim() || null,
        p_access_ends_on: $('partner-access-end').value
      });
      if (error) throw error;
      if (result) result.textContent = 'Compte prestataire associé. La personne peut se connecter avec son compte existant.';
      event.target.reset();
      await loadProfiles();
    } catch (error) {
      if (result) result.textContent = error.message.includes('not found')
        ? 'Aucun compte Supabase Auth ne correspond à cet e-mail. Crée d’abord son compte, puis associe-le ici.'
        : `Association impossible : ${error.message}`;
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function loadAccountAccess() {
    const { data: userResult, error: userError } = await db.auth.getUser();
    if (userError || !userResult?.user) {
      showLoginError('Session invalide. Connectez-vous à nouveau.');
      await db.auth.signOut();
      return false;
    }
    const { data: profile, error } = await db.from('account_profiles')
      .select('user_id,role,email,display_name,business_name,business_address,business_phone,business_email,business_legal_id,is_active,access_ends_on')
      .eq('user_id', userResult.user.id).maybeSingle();
    const validRole = profile && ['super_admin', 'partner'].includes(profile.role);
    const withinExpiry = !profile?.access_ends_on || profile.access_ends_on >= madagascarToday();
    if (error || !validRole || !profile.is_active || !withinExpiry) {
      await db.auth.signOut();
      showLoginError(error ? `Vérification du compte impossible : ${error.message}` : 'Ce compte n’a pas d’accès actif à l’administration. Contactez le super-admin.');
      return false;
    }
    window.currentAccountProfile = profile;
    window.currentAccountUserId = userResult.user.id;
    applyRoleUi(profile);
    if (profile.role === 'super_admin') await loadProfiles();
    return true;
  }

  window.loadAccountAccess = loadAccountAccess;
  window.loadAccountProfiles = loadProfiles;
  document.addEventListener('DOMContentLoaded', () => {
    $('partner-account-form')?.addEventListener('submit', addPartner);
    $('account-profiles-table')?.addEventListener('click', event => {
      const button = event.target.closest('[data-toggle-partner]');
      if (button) setPartnerActive(button.dataset.togglePartner, button.dataset.nextActive === 'true');
    });
    const end = $('partner-access-end');
    if (end) end.min = madagascarToday();
  });
})();
