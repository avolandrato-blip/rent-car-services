(() => {
  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let initialized = false;
  let loaded = false;
  let busy = false;

  function buildInterface() {
    if (initialized) return;
    const nav = document.querySelector('.nav');
    const beforeSection = document.getElementById('chauffeurs');
    if (!nav || !beforeSection) return;
    nav.insertAdjacentHTML('beforeend', '<button data-tab="partner-accounts" type="button">Comptes partenaires</button>');
    beforeSection.insertAdjacentHTML('beforebegin', `
      <section id="partner-accounts" class="tab">
        <div class="card">
          <div class="section-head"><div><h2>Créer un compte partenaire</h2><p class="muted">Le login sera basé sur son prénom (ex. <code>tiana</code>, comme pour un chauffeur). Un mot de passe aléatoire temporaire sera affiché une seule fois et devra être remplacé à la première connexion.</p></div></div>
          <form id="partner-create-form" class="form-grid">
            <div class="field"><label for="partner-first-name">Prénom du partenaire</label><input id="partner-first-name" name="first_name" maxlength="80" autocomplete="off" required></div>
            <div class="field"><label for="partner-access-end">Fin d’accès / contrat</label><input id="partner-access-end" name="access_ends_on" type="date" required><small class="muted">L’accès reste valable jusqu’à 23 h 59, heure de Madagascar, à cette date.</small></div>
            <div class="field full"><button id="partner-create-submit" type="submit" class="btn primary">Créer le compte partenaire</button></div>
          </form>
          <p id="partner-admin-message" class="notice" role="status" aria-live="polite" hidden></p>
          <div id="partner-secret" class="notice warn" hidden></div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="section-head"><div><h2>Comptes partenaires</h2><p class="muted">Ici, vous pouvez prolonger l’accès, suspendre/réactiver un compte ou générer un nouveau mot de passe temporaire.</p></div><button id="partner-list-refresh" type="button" class="btn outline">Actualiser</button></div>
          <div id="partner-accounts-table" class="table-wrap" style="margin-top:12px"><div class="empty">Chargement…</div></div>
        </div>
      </section>`);
    nav.addEventListener('click', event => {
      const button = event.target.closest('[data-tab="partner-accounts"]');
      if (!button) return;
      document.querySelectorAll('.nav button').forEach(item => item.classList.toggle('active', item === button));
      document.querySelectorAll('.tab').forEach(item => item.classList.toggle('active', item.id === 'partner-accounts'));
      const title = document.getElementById('page-title');
      if (title) title.textContent = 'Comptes partenaires';
      loadAccounts();
    });
    $('partner-create-form').addEventListener('submit', createAccount);
    $('partner-list-refresh').addEventListener('click', loadAccounts);
    $('partner-accounts-table').addEventListener('click', handleTableClick);
    initialized = true;
  }

  function showMessage(text, error = false) {
    const node = $('partner-admin-message');
    node.textContent = text;
    node.className = `notice${error ? ' error' : ''}`;
    node.hidden = !text;
  }

  function showTemporarySecret(login, password, reset = false) {
    const panel = $('partner-secret');
    panel.innerHTML = `<strong>${reset ? 'Nouveau mot de passe temporaire' : 'Compte créé'}</strong><br>Login : <code>${esc(login)}</code><br>Mot de passe temporaire : <code id="partner-temp-password">${esc(password)}</code><br><small>Copiez et transmettez ces informations en privé. Le mot de passe ne sera plus affiché après fermeture ou actualisation de cette page.</small><br><button id="partner-copy-secret" type="button" class="btn outline" style="margin-top:8px">Copier les identifiants</button>`;
    panel.hidden = false;
    $('partner-copy-secret').addEventListener('click', async () => {
      const text = `Login : ${login}\nMot de passe temporaire : ${password}`;
      try { await navigator.clipboard.writeText(text); showMessage('Identifiants copiés. Transmettez-les au partenaire en privé.'); }
      catch { window.prompt('Copiez ces identifiants puis transmettez-les en privé :', text); }
    }, { once: true });
    panel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function invoke(body) {
    const { data, error } = await db.functions.invoke('manage-partner-account', { body });
    if (error) throw new Error(data?.error || error.message || 'Fonction partenaire indisponible.');
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function createAccount(event) {
    event.preventDefault();
    if (busy) return;
    const firstName = $('partner-first-name').value.trim();
    const accessEnd = $('partner-access-end').value;
    if (!firstName || !accessEnd) return showMessage('Saisissez le prénom et la date de fin d’accès.', true);
    busy = true;
    $('partner-create-submit').disabled = true;
    $('partner-secret').hidden = true;
    showMessage('Création du compte et du mot de passe temporaire…');
    try {
      const result = await invoke({ action: 'create', first_name: firstName, access_ends_on: accessEnd });
      $('partner-create-form').reset();
      showMessage(`Compte partenaire créé : ${result.login_name}.`);
      showTemporarySecret(result.login_name, result.initial_password);
      loaded = false;
      await loadAccounts();
    } catch (error) { showMessage(`Création impossible : ${error.message}`, true); }
    finally { busy = false; $('partner-create-submit').disabled = false; }
  }

  async function loadAccounts() {
    if (!initialized || loaded && busy) return;
    $('partner-accounts-table').innerHTML = '<div class="empty">Chargement des comptes…</div>';
    const { data, error } = await db.from('account_profiles')
      .select('user_id,login_name,display_name,is_active,access_ends_on,must_change_password,created_at')
      .eq('role', 'partner').order('created_at', { ascending: false }).limit(500);
    if (error) {
      $('partner-accounts-table').innerHTML = `<div class="notice error">Lecture impossible : ${esc(error.message)}</div>`;
      loaded = false;
      return;
    }
    loaded = true;
    const rows = data || [];
    $('partner-accounts-table').innerHTML = rows.length ? `<table class="table"><thead><tr><th>Partenaire</th><th>État</th><th>Fin d’accès</th><th>Actions</th></tr></thead><tbody>${rows.map(profile => `<tr data-partner-row="${esc(profile.user_id)}"><td><strong>${esc(profile.login_name || 'Login manquant')}</strong><br><small>${esc(profile.display_name || '')}</small>${profile.must_change_password ? '<br><span class="pill partial">Mot de passe temporaire à changer</span>' : ''}</td><td><span class="pill ${profile.is_active ? 'available' : 'inactive'}">${profile.is_active ? 'Actif' : 'Suspendu'}</span></td><td><input type="date" data-access-end value="${esc(profile.access_ends_on || '')}" aria-label="Date de fin d’accès"></td><td><div class="actions"><button type="button" class="btn outline" data-action="save" data-user="${esc(profile.user_id)}">Enregistrer date / état</button><button type="button" class="btn outline" data-action="reset" data-user="${esc(profile.user_id)}">Nouveau mot de passe</button><button type="button" class="btn ${profile.is_active ? 'danger' : 'primary'}" data-action="toggle" data-user="${esc(profile.user_id)}" data-active="${profile.is_active}">${profile.is_active ? 'Suspendre' : 'Réactiver'}</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucun compte partenaire créé.</div>';
  }

  async function savePartner(userId, activeOverride = null, resetPassword = false) {
    const row = document.querySelector(`[data-partner-row="${CSS.escape(userId)}"]`);
    if (!row) return;
    const date = row.querySelector('[data-access-end]').value;
    const active = activeOverride == null ? row.querySelector('[data-action="toggle"]')?.dataset.active === 'true' : activeOverride;
    if (!date) return showMessage('La date de fin d’accès est obligatoire.', true);
    if (resetPassword && !window.confirm('Générer un nouveau mot de passe temporaire ? L’ancien mot de passe cessera immédiatement de fonctionner.')) return;
    busy = true;
    showMessage(resetPassword ? 'Génération du nouveau mot de passe…' : 'Enregistrement du compte…');
    try {
      const result = await invoke({ action: 'update', user_id: userId, access_ends_on: date, is_active: active, reset_password: resetPassword });
      showMessage('Compte partenaire mis à jour.');
      if (resetPassword) showTemporarySecret(result.login_name, result.initial_password, true);
      loaded = false;
      await loadAccounts();
    } catch (error) { showMessage(`Mise à jour impossible : ${error.message}`, true); }
    finally { busy = false; }
  }

  function handleTableClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button || busy) return;
    const userId = button.dataset.user;
    if (button.dataset.action === 'save') savePartner(userId);
    if (button.dataset.action === 'reset') savePartner(userId, null, true);
    if (button.dataset.action === 'toggle') savePartner(userId, button.dataset.active !== 'true');
  }

  async function initPartnerAccountsAdmin() {
    buildInterface();
    if (initialized) {
      loaded = false;
      await loadAccounts();
    }
  }

  window.initPartnerAccountsAdmin = initPartnerAccountsAdmin;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildInterface, { once: true });
  else buildInterface();
})();
