(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const navButton = id => $(`.nav button[data-tab="${id}"]`);
  const pageTitle = $('#page-title');
  const homeButton = $('.dashboard-home-button');
  const dashboard = $('#overview');
  if (!dashboard || !pageTitle) return;

  function activateTab(id) {
    const target = navButton(id);
    if (!target) return;
    target.click();
    if (id === 'reservations') {
      const pending = $('[data-dashboard-pending="true"]');
      if (pending?.dataset.openPending === 'true') {
        const filter = $('#reservation-status-filter');
        if (filter) filter.value = 'pre_reserved';
        window.renderReservations?.();
      }
    }
    if (homeButton) homeButton.hidden = id === 'overview';
    if (id !== 'overview') {
      const activeTab = $(`#${CSS.escape(id)}`);
      activeTab?.setAttribute('aria-labelledby', 'page-title');
    }
  }

  document.addEventListener('click', event => {
    const shortcut = event.target.closest('[data-dashboard-tab]');
    if (!shortcut) return;
    if (shortcut.matches('[data-dashboard-pending="true"]')) {
      const filter = $('#reservation-status-filter');
      if (filter) filter.value = 'pre_reserved';
      activateTab('reservations');
      window.renderReservations?.();
      return;
    }
    activateTab(shortcut.dataset.dashboardTab);
  });

  document.querySelectorAll('.nav button').forEach(button => {
    button.addEventListener('click', () => {
      if (homeButton) homeButton.hidden = button.dataset.tab === 'overview';
    });
  });

  const date = $('#dashboard-today');
  if (date) date.textContent = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  if (homeButton) homeButton.hidden = true;
})();
