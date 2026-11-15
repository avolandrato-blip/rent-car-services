(() => {
  const MODE_KEY = 'rentcar-theme-mode';
  const LEGACY_KEY = 'rentcar-theme';
  const THEME_BY_MODE = { light: 'premium-white', dark: 'royal-night' };
  const MODE_BY_THEME = { 'premium-white': 'light', 'royal-night': 'dark' };

  function readMode() {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
      const legacy = MODE_BY_THEME[localStorage.getItem(LEGACY_KEY)];
      return legacy || 'light';
    } catch (_) {
      return 'light';
    }
  }

  function applyMode(mode, persist = false) {
    const selected = mode === 'dark' ? 'dark' : 'light';
    const theme = THEME_BY_MODE[selected];
    document.documentElement.dataset.theme = theme;
    if (document.body) document.body.dataset.theme = theme;
    document.querySelectorAll('.rc-theme-switcher').forEach(group => {
      group.querySelectorAll('[data-theme-choice]').forEach(button => {
        const active = button.dataset.themeChoice === selected;
        button.setAttribute('aria-pressed', String(active));
        button.classList.toggle('is-active', active);
      });
    });
    if (persist) {
      try {
        localStorage.setItem(MODE_KEY, selected);
        localStorage.setItem(LEGACY_KEY, theme);
      } catch (_) {}
    }
  }

  function makeSwitcher() {
    const group = document.createElement('div');
    group.className = 'rc-theme-switcher';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Choisir le thème du site');

    const choices = [
      { mode: 'light', label: 'Clair', icon: '☀' },
      { mode: 'dark', label: 'Sombre', icon: '◐' },
    ];
    for (const choice of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'rc-theme-option';
      button.dataset.themeChoice = choice.mode;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `Activer le mode ${choice.label.toLowerCase()}`);
      button.title = `Mode ${choice.label.toLowerCase()}`;
      const icon = document.createElement('span');
      icon.className = 'rc-theme-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = choice.icon;
      const text = document.createElement('span');
      text.textContent = choice.label;
      button.append(icon, text);
      button.addEventListener('click', () => applyMode(choice.mode, true));
      group.append(button);
    }
    return group;
  }

  function mountSwitchers() {
    const targets = [
      ...document.querySelectorAll('#nav-menu'),
      ...document.querySelectorAll('.topbar-actions'),
      ...document.querySelectorAll('.team-top'),
      ...document.querySelectorAll('#login-view .login, #team-login'),
      ...document.querySelectorAll('.action-shell'),
      ...document.querySelectorAll('.top .wrap'),
    ];
    const uniqueTargets = [...new Set(targets)];
    if (!uniqueTargets.length) {
      const group = makeSwitcher();
      group.classList.add('rc-theme-switcher-fixed');
      document.body.append(group);
      applyMode(readMode());
      return;
    }
    uniqueTargets.forEach(target => {
      if (!target.querySelector(':scope > .rc-theme-switcher')) target.append(makeSwitcher());
    });
    applyMode(readMode());
  }

  applyMode(readMode());
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      applyMode(readMode());
      mountSwitchers();
    }, { once: true });
  } else {
    mountSwitchers();
  }
  window.addEventListener('storage', event => {
    if (event.key === MODE_KEY || event.key === LEGACY_KEY) applyMode(readMode());
  });
  window.setRentCarTheme = mode => applyMode(mode, true);
})();
