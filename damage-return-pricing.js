(() => {
  const defaultComponents = [
    { key: 'rim', label: 'Jante' },
    { key: 'tire', label: 'Pneu' },
    { key: 'windshield', label: 'Pare-brise' },
    { key: 'front_bumper_scratch', label: 'Rayure pare-chocs avant' },
    { key: 'rear_bumper_scratch', label: 'Rayure pare-chocs arrière' },
    { key: 'door', label: 'Portière' },
    { key: 'sill', label: 'Bas de caisse' },
    { key: 'front_window', label: 'Vitre avant' },
    { key: 'door_handle', label: 'Poignée de porte' }
  ];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const money = value => `${Number(value || 0).toLocaleString('fr-FR')} Ar`;

  function componentDefinitions() {
    return Array.isArray(window.rentCarDamageComponents) && window.rentCarDamageComponents.length
      ? window.rentCarDamageComponents
      : defaultComponents;
  }

  function selectedItems() {
    return [...document.querySelectorAll('#rf-damage-items .rf-damage-check:checked')].map(checkbox => {
      const row = checkbox.closest('[data-component-key]');
      const priceInput = row.querySelector('.rf-damage-unit-price');
      const quantity = Math.max(1, Number(row.querySelector('.rf-damage-quantity').value || 1));
      const unitPrice = Math.max(0, Number(priceInput.value || 0));
      return {
        component_key: row.dataset.componentKey,
        label: row.dataset.componentLabel,
        quantity,
        unit_price: unitPrice,
        total: quantity * unitPrice
      };
    });
  }

  function updateTotal() {
    const items = selectedItems();
    const itemTotal = items.reduce((sum, item) => sum + item.total, 0);
    const itemTotalLabel = document.getElementById('rf-damage-total-label');
    if (itemTotalLabel) itemTotalLabel.textContent = money(itemTotal);
    const parts = document.getElementById('rf-repair');
    const total = document.getElementById('rf-total');
    if (parts) parts.value = String(itemTotal);
    if (total) {
      const ids = ['rf-repair', 'rf-other-repair', 'rf-labor', 'rf-tow', 'rf-cleaning', 'rf-other-cost'];
      total.value = String(ids.reduce((sum, id) => sum + Number(document.getElementById(id)?.value || 0), 0));
    }
    return { items, itemTotal };
  }

  function renderItems(definitions, savedRows) {
    const savedByKey = new Map((savedRows || []).map(row => [row.component_key, row]));
    const allItems = definitions.map(item => {
      const saved = savedByKey.get(item.key);
      return { key: item.key, label: item.label, price: saved?.price ?? null };
    });
    (savedRows || []).filter(row => !allItems.some(item => item.key === row.component_key)).forEach(row => {
      allItems.push({ key: row.component_key, label: row.component_label, price: row.price ?? null });
    });
    const target = document.getElementById('rf-damage-items');
    if (!target) return;
    target.innerHTML = `<p class="rf-damage-help">Cochez les éléments concernés. Les tarifs enregistrés pour cette voiture sont préremplis ; un tarif manquant peut être saisi ici pour ce constat sans modifier la grille des tarifs.</p><div class="rf-damage-list">${allItems.map(item => `<div class="rf-damage-item" data-component-key="${esc(item.key)}" data-component-label="${esc(item.label)}"><label class="rf-damage-name"><input type="checkbox" class="rf-damage-check"><span><strong>${esc(item.label)}</strong></span></label><div class="rf-damage-fields"><label>Quantité<input class="rf-damage-quantity" type="number" min="1" step="1" value="1" disabled></label><label>Prix unitaire (Ar)<input class="rf-damage-unit-price" type="number" min="0" step="1" inputmode="numeric" placeholder="À renseigner" value="${item.price == null ? '' : esc(item.price)}" disabled></label></div><small>${item.price == null ? 'Aucun tarif enregistré pour cette voiture' : `Tarif enregistré : ${money(item.price)}`}</small></div>`).join('')}</div><p class="rf-damage-total">Total des éléments sélectionnés : <strong id="rf-damage-total-label">0 Ar</strong></p>`;

    target.querySelectorAll('.rf-damage-item').forEach(row => {
      const checkbox = row.querySelector('.rf-damage-check');
      const price = row.querySelector('.rf-damage-unit-price');
      const quantity = row.querySelector('.rf-damage-quantity');
      checkbox.addEventListener('change', () => {
        price.disabled = !checkbox.checked;
        quantity.disabled = !checkbox.checked;
        price.required = checkbox.checked;
        updateTotal();
      });
      [price, quantity].forEach(input => input.addEventListener('input', updateTotal));
    });
    updateTotal();
  }

  async function loadPrices(vehicleId) {
    const target = document.getElementById('rf-damage-items');
    if (!target) return;
    target.innerHTML = '<p class="notice">Chargement des tarifs associés à ce véhicule…</p>';
    const db = window.rentCarSupabase;
    if (!db) {
      renderItems(componentDefinitions(), []);
      return;
    }
    const { data, error } = await db.from('vehicle_damage_prices')
      .select('component_key,component_label,price')
      .eq('vehicle_id', vehicleId)
      .order('component_label', { ascending: true });
    renderItems(componentDefinitions(), error ? [] : (data || []));
    if (error) {
      const note = document.createElement('p');
      note.className = 'notice';
      note.textContent = `Les tarifs enregistrés n’ont pas pu être chargés (${error.message}). Vous pouvez tout de même saisir les montants de ce constat.`;
      target.prepend(note);
    }
  }

  function installStyles() {
    if (document.getElementById('return-damage-pricing-styles')) return;
    const style = document.createElement('style');
    style.id = 'return-damage-pricing-styles';
    style.textContent = `.rf-damage-help{font-size:12px;color:#536779;line-height:1.5}.rf-damage-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.rf-damage-item{border:1px solid #e4ebf1;border-radius:10px;padding:10px;background:#fff}.rf-damage-name{display:flex!important;align-items:center;gap:8px;color:#0b1f33!important}.rf-damage-name input{width:auto!important}.rf-damage-fields{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;margin-top:8px}.rf-damage-fields label{font-size:11px!important}.rf-damage-fields input{padding:7px!important}.rf-damage-item small{display:block;margin-top:5px;color:#66788a}.rf-damage-total{margin:10px 0;padding:10px;border-radius:8px;background:#edf5fb;color:#0d5c8f}@media(max-width:650px){.rf-damage-list{grid-template-columns:1fr}.rf-damage-fields{grid-template-columns:100px minmax(0,1fr)}}`;
    document.head.appendChild(style);
  }

  function enhanceDamageForm(reservationId) {
    const modal = document.getElementById('reference-model-modal');
    const form = document.getElementById('reference-model-form');
    if (!modal || !form || modal.dataset.damagePricingEnhanced === 'true') return;
    modal.dataset.damagePricingEnhanced = 'true';
    installStyles();
    const detailsField = document.getElementById('rf-details')?.closest('.field');
    if (!detailsField) return;
    detailsField.insertAdjacentHTML('afterend', '<div class="field full"><label>Éléments de casse et tarifs par véhicule</label><div id="rf-damage-items"></div></div>');

    const partTotal = document.getElementById('rf-repair');
    const otherRepairField = partTotal?.closest('.field');
    if (partTotal && otherRepairField) {
      otherRepairField.querySelector('label').textContent = 'Total des éléments de casse sélectionnés (Ar)';
      partTotal.readOnly = true;
      otherRepairField.insertAdjacentHTML('afterend', '<div class="field"><label>Autres réparations / pièces hors liste (Ar)</label><input id="rf-other-repair" type="number" min="0" value="0"></div>');
    }
    const total = document.getElementById('rf-total');
    if (total) total.readOnly = true;
    const totalLabel = total?.closest('.field')?.querySelector('label');
    if (totalLabel) totalLabel.textContent = 'Total à payer — calcul automatique (Ar)';

    const originalSubmit = form.onsubmit;
    form.onsubmit = async event => {
      const { items } = updateTotal();
      if (items.some(item => !Number.isFinite(item.unit_price) || item.unit_price < 0)) return;
      if (typeof originalSubmit === 'function') return originalSubmit.call(form, event);
    };
    form.addEventListener('input', event => {
      if (event.target.matches('#rf-other-repair,#rf-labor,#rf-tow,#rf-cleaning,#rf-other-cost')) updateTotal();
    });
    loadPrices(reservationId);
  }

  window.rentCarReturnDamageSummary = selectedItems;
  window.renderDamageItemsForPdf = payload => {
    const items = Array.isArray(payload?.damage_items) ? payload.damage_items : [];
    if (!items.length) return '';
    return `<div class="box"><strong>Éléments de casse retenus</strong><ul>${items.map(item => `<li>${esc(item.label)} — ${esc(item.quantity)} × ${money(item.unit_price)} = <b>${money(item.total)}</b></li>`).join('')}</ul><b>Total des éléments : ${money(payload.damage_items_total)}</b></div>`;
  };

  const existingOpen = window.printReturnForm;
  if (typeof existingOpen === 'function') {
    window.printReturnForm = function (id, kind) {
      const result = existingOpen.apply(this, arguments);
      if (kind === 'degradation') {
        const reservation = typeof window.reservations !== 'undefined'
          ? window.reservations.find(item => item.id === id)
          : (typeof reservations !== 'undefined' ? reservations.find(item => item.id === id) : null);
        window.setTimeout(() => enhanceDamageForm(reservation?.vehicle_id), 0);
      }
      return result;
    };
  }
})();
