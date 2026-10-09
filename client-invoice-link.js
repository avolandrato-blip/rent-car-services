(() => {
  function openInvoiceFromSecureLink() {
    const params = new URLSearchParams(window.location.hash.slice(1));
    if (params.get('invoice') !== 'access') return;

    const credentials = {
      reference: params.get('reference') || '',
      phone: params.get('phone') || '',
      otp: params.get('otp') || ''
    };
    const panel = document.getElementById('invoice-access-panel');
    const form = document.getElementById('invoice-access-form');
    const status = document.getElementById('invoice-access-result');
    panel?.classList.remove('hidden');

    document.getElementById('invoice-reference').value = credentials.reference;
    document.getElementById('invoice-phone').value = credentials.phone;
    document.getElementById('invoice-otp').value = credentials.otp;

    // Remove the bearer code from the address bar and browser history before any network call.
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    if (typeof window.openTab === 'function') window.openTab('booking', { silent: true });

    if (!credentials.reference || !credentials.phone || !credentials.otp) {
      if (form) form.classList.remove('hidden');
      if (status) {
        status.className = 'booking-result booking-error';
        status.textContent = 'Le lien sécurisé est incomplet. Utilisez les informations et le code reçus par WhatsApp.';
      }
      return;
    }

    if (form) form.classList.add('hidden');
    void window.verifyInvoiceOtp(null, credentials);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openInvoiceFromSecureLink, { once: true });
  } else {
    openInvoiceFromSecureLink();
  }
})();
