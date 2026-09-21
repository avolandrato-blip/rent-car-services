(() => {
  const initLogin = () => {
    const form = document.getElementById('login-form');
    const db = window.rentCarSupabase;
    if (!form || !db || form.dataset.loginFixAttached === '1') return;
    form.dataset.loginFixAttached = '1';
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const errorBox = document.getElementById('login-error');
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submit = form.querySelector('button[type="submit"]');
      if (!email || !password) { if (errorBox) errorBox.textContent = 'Saisissez votre e-mail et votre mot de passe.'; return; }
      if (submit) { submit.disabled = true; submit.textContent = 'Connexion…'; }
      if (errorBox) errorBox.textContent = '';
      try {
        const { data, error } = await db.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.session) throw new Error('Session non créée. Vérifiez l’adresse e-mail et le mot de passe.');
        document.getElementById('login-view')?.classList.add('hidden');
        document.getElementById('app-view')?.classList.remove('hidden');
        const month = document.getElementById('calendar-month');
        if (month) month.value = new Date().toISOString().slice(0, 7);
        if (typeof window.refreshAll === 'function') await window.refreshAll();
        else if (typeof refreshAll === 'function') await refreshAll();
      } catch (error) {
        const message = String(error?.message || error);
        if (errorBox) errorBox.textContent = message.includes('Invalid login credentials') ? 'E-mail ou mot de passe incorrect.' : message.includes('Email not confirmed') ? 'Adresse e-mail non confirmée. Vérifiez votre boîte e-mail Supabase.' : `Connexion impossible : ${message}`;
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = 'Se connecter'; }
      }
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initLogin);
  else initLogin();
})();
