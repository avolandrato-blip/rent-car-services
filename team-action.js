(() => {
  const $ = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const token = params.get('token') || '';
  const response = params.get('response') || '';
  // Le lien est à usage unique : retirer le jeton de la barre d’adresse après lecture.
  history.replaceState(null, '', location.pathname);

  function setResult(message, kind = '') {
    const target = $('action-result');
    target.textContent = message;
    target.className = `action-result ${kind}`;
  }
  async function hashToken(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function submitResponse() {
    const button = $('action-confirm');
    button.disabled = true;
    try {
      if (!token || !['accept','refuse'].includes(response) || !window.rentCarSupabase) throw new Error('Lien incomplet ou page indisponible.');
      const tokenHash = await hashToken(token);
      const {data,error} = await window.rentCarSupabase.rpc('respond_to_chauffeur_mission', {p_token_hash:tokenHash,p_response:response});
      if (error) throw error;
      if (data !== true) {
        $('action-confirm').classList.add('hidden');
        return setResult('Ce lien a expiré, a déjà été utilisé ou la mission a été annulée. Contactez l’administration pour obtenir une nouvelle affectation.', 'action-error');
      }
      $('action-confirm').classList.add('hidden');
      setResult(response === 'accept' ? 'Mission acceptée. Le statut a été mis à jour dans votre tableau de bord.' : 'Mission refusée. Le statut a été mis à jour dans votre tableau de bord.', 'action-ok');
    } catch (error) {
      button.disabled = false;
      setResult(`Réponse non enregistrée : ${error?.message || error}. Ouvrez votre espace chauffeur ou contactez l’administration.`, 'action-error');
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    $('action-title').textContent = response === 'accept' ? 'Accepter cette mission ?' : response === 'refuse' ? 'Refuser cette mission ?' : 'Lien de mission invalide';
    $('action-copy').textContent = response === 'accept'
      ? 'En confirmant, la mission sera marquée « Mission acceptée » dans votre tableau de bord.'
      : response === 'refuse'
        ? 'En confirmant, la mission sera marquée « Mission refusée » dans votre tableau de bord.'
        : 'Ce lien ne contient pas une action valide. Demandez un nouveau lien à l’administration.';
    if (!token || !['accept','refuse'].includes(response)) $('action-confirm').classList.add('hidden');
    else $('action-confirm').addEventListener('click', submitResponse);
  });
})();
