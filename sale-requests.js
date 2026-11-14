(() => {
  'use strict';

  const whatsappNumber = '261349120726';
  const modalOpeners = new Map();

  const value = (form, name) => String(new FormData(form).get(name) || '').trim();
  const formatMoney = amount => {
    const number = Number(amount);
    return Number.isFinite(number) ? `${number.toLocaleString('fr-FR')} Ar` : amount;
  };

  document.querySelectorAll('[data-sale-open]').forEach(button => {
    button.addEventListener('click', () => {
      const kind = button.dataset.saleOpen;
      const dialog = document.getElementById(kind === 'seller' ? 'sale-seller-modal' : 'sale-buyer-modal');
      if (!dialog || typeof dialog.showModal !== 'function') return;
      modalOpeners.set(dialog, button);
      dialog.showModal();
      dialog.querySelector('input')?.focus();
    });
  });

  document.querySelectorAll('[data-sale-close]').forEach(button => {
    button.addEventListener('click', () => button.closest('dialog')?.close());
  });

  document.querySelectorAll('.sale-request-modal').forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => modalOpeners.get(dialog)?.focus());
  });

  const buyerForm = document.getElementById('sale-buyer-form');
  const yearToInput = buyerForm?.elements.namedItem('year_to');
  const validateYears = () => {
    const yearFrom = Number(value(buyerForm, 'year_from'));
    const yearTo = Number(value(buyerForm, 'year_to'));
    yearToInput?.setCustomValidity(yearFrom && yearTo && yearFrom > yearTo
      ? 'L’année maximale doit être égale ou supérieure à l’année minimale.'
      : '');
  };
  buyerForm?.addEventListener('input', validateYears);
  buyerForm?.addEventListener('change', validateYears);

  function sendToWhatsApp(form, message) {
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    const actions = form.querySelector('.sale-modal-actions');
    let fallback = form.querySelector('.sale-whatsapp-fallback');
    if (!fallback) {
      fallback = document.createElement('p');
      fallback.className = 'sale-whatsapp-fallback';
      fallback.setAttribute('role', 'status');
      actions?.append(fallback);
    }
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    fallback.replaceChildren(document.createTextNode('WhatsApp s’ouvre avec votre message. Confirmez son envoi dans l’application. '));
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = opened ? 'Ouvrir à nouveau le message' : 'Cliquez ici pour ouvrir WhatsApp';
    fallback.append(link);
  }

  document.querySelector('[data-sale-form="seller"]')?.addEventListener('submit', event => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = [
      ['Nom et prénom', value(form, 'name')],
      ['Téléphone / WhatsApp', value(form, 'phone')],
      ['Marque', value(form, 'make')],
      ['Modèle', value(form, 'model')],
      ['Année', value(form, 'year')],
      ['Kilométrage', value(form, 'mileage') ? `${Number(value(form, 'mileage')).toLocaleString('fr-FR')} km` : 'Non précisé'],
      ['État général', value(form, 'condition')],
      ['Prix souhaité', formatMoney(value(form, 'price'))],
      ['Défauts ou réparations connus', value(form, 'defects') || 'Non précisés'],
      ['Documents disponibles', value(form, 'documents') || 'À préciser'],
      ['Localisation', value(form, 'location')],
      ['Informations complémentaires', value(form, 'notes') || 'Aucune'],
    ];
    sendToWhatsApp(form, `Bonjour Rent Car Service, je souhaite proposer un véhicule à vendre.\n\n${fields.map(([label, content]) => `${label} : ${content}`).join('\n')}\n\nMerci de rester mon interlocuteur pour toutes les demandes et visites et de ne pas communiquer directement mes coordonnées à l’acheteur.`);
  });

  buyerForm?.addEventListener('submit', event => {
    event.preventDefault();
    validateYears();
    if (!buyerForm.reportValidity()) return;
    const fields = [
      ['Nom et prénom', value(buyerForm, 'name')],
      ['Téléphone / WhatsApp', value(buyerForm, 'phone')],
      ['Marque souhaitée', value(buyerForm, 'make')],
      ['Modèle souhaité', value(buyerForm, 'model')],
      ['Année minimale', value(buyerForm, 'year_from') || 'Sans préférence'],
      ['Année maximale', value(buyerForm, 'year_to') || 'Sans préférence'],
      ['Budget maximal', formatMoney(value(buyerForm, 'budget'))],
      ['Nombre de places', value(buyerForm, 'seats')],
      ['Autres critères ou préférences', value(buyerForm, 'preferences') || 'Aucune'],
    ];
    sendToWhatsApp(buyerForm, `Bonjour Rent Car Service, je recherche une voiture.\n\n${fields.map(([label, content]) => `${label} : ${content}`).join('\n')}\n\nMerci de rester mon interlocuteur, de centraliser les échanges et de ne pas communiquer directement mes coordonnées au vendeur.`);
  });
})();
