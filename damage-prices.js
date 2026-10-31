(() => {
  const $ = id => document.getElementById(id);
  const db = window.rentCarSupabase;
  const defaults = [
    ['rim', 'Jante'],
    ['tire', 'Pneu'],
    ['windshield', 'Pare-brise'],
    ['front_bumper_scratch', 'Rayure pare-chocs avant'],
    ['rear_bumper_scratch', 'Rayure pare-chocs arrière'],
    ['door', 'Portière'],
    ['sill', 'Bas de caisse'],
    ['front_window', 'Vitre avant'],
    ['door_handle', 'Poignée de porte']
  ];
  const defaultKeys = new Set(defaults.map(([key]) => key));
  window.rentCarDamageComponents = defaults.map(([key, label]) => ({ key, label }));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  let rows = [];
  let currentVehicleId = '';

  function setStatus(message, isError = false) {
    const target = $('damage-prices-status');
    if (!target) return;
    target.textContent = message;
    target.classList.toggle('damage-error', isError);
  }

  function render() {
    const target = $('damage-price-list');
    if (!target) return;
    if (!currentVehicleId) {
      target.innerHTML = '<div class="empty">Aucun véhicule disponible.</div>';
      return;
    }
    if (!rows.length) {
      target.innerHTML = '<div class="empty">Aucun élément à afficher.</div>';
      return;
    }
    target.innerHTML = `<table class="table damage-prices-table"><thead><tr><th>Élément endommagé</th><th>Prix de remplacement / réparation (Ar)</th><th></th></tr></thead><tbody>${rows.map(row => `<tr><td><strong>${esc(row.component_label)}</strong>${row.isCustom ? '<br><small>Élément ajouté</small>' : ''}</td><td><input class="damage-price-value" type="number" min="0" step="1" inputmode="numeric" placeholder="À renseigner" aria-label="Prix pour ${esc(row.component_label)}" data-component-key="${esc(row.component_key)}" value="${row.price == null ? '' : esc(row.price)}"></td><td>${row.isCustom ? `<button class="btn danger damage-price-delete" type="button" data-component-key="${esc(row.component_key)}" aria-label="Supprimer ${esc(row.component_label)}">Supprimer</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
    target.querySelectorAll('.damage-price-delete').forEach(button => button.addEventListener('click', deleteCustomRow));
  }

  async function loadDamagePricesAdmin() {
    const select = $('damage-price-vehicle');
    if (!select || !db) return;
    const vehicles = (window.vehicles || []).filter(vehicle => vehicle.status !== 'contract_ended');
    const wantedId = select.value || currentVehicleId;
    select.innerHTML = vehicles.map(vehicle => `<option value="${esc(vehicle.id)}">${esc(vehicle.name || [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Véhicule')}</option>`).join('');
    if (!vehicles.length) {
      currentVehicleId = '';
      rows = [];
      render();
      setStatus('Ajoutez d’abord un véhicule dans la section « Véhicules ».', true);
      return;
    }
    currentVehicleId = vehicles.some(vehicle => vehicle.id === wantedId) ? wantedId : vehicles[0].id;
    select.value = currentVehicleId;
    setStatus('Chargement des tarifs…');
    const { data, error } = await db.from('vehicle_damage_prices')
      .select('id,vehicle_id,component_key,component_label,price')
      .eq('vehicle_id', currentVehicleId)
      .order('component_label', { ascending: true });
    if (error) {
      rows = [];
      render();
      setStatus(`Impossible de charger les tarifs. Vérifiez que la migration vehicle_damage_prices est appliquée. Détail : ${error.message}`, true);
      return;
    }
    const savedByKey = new Map((data || []).map(item => [item.component_key, item]));
    rows = defaults.map(([key, label]) => {
      const saved = savedByKey.get(key);
      return { component_key: key, component_label: label, price: saved?.price ?? null, isCustom: false };
    });
    (data || []).filter(item => !defaultKeys.has(item.component_key)).forEach(item => rows.push({
      component_key: item.component_key,
      component_label: item.component_label,
      price: item.price,
      isCustom: true
    }));
    render();
    setStatus(`Tarifs de casse pour ${vehicles.find(vehicle => vehicle.id === currentVehicleId)?.name || 'ce véhicule'}. Les champs vides restent « à renseigner ».`);
  }

  async function saveDamagePrices(event) {
    event.preventDefault();
    if (!currentVehicleId) return;
    const button = $('damage-price-save');
    button.disabled = true;
    const values = new Map([...document.querySelectorAll('.damage-price-value')].map(input => [input.dataset.componentKey, input.value.trim()]));
    const invalid = [...values.entries()].find(([, value]) => value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0));
    if (invalid) {
      setStatus('Saisissez un montant valide, égal ou supérieur à zéro.', true);
      button.disabled = false;
      return;
    }
    const payload = rows.map(row => ({
      vehicle_id: currentVehicleId,
      component_key: row.component_key,
      component_label: row.component_label,
      price: values.get(row.component_key) === '' ? null : Number(values.get(row.component_key))
    }));
    setStatus('Enregistrement…');
    const { error } = await db.from('vehicle_damage_prices').upsert(payload, { onConflict: 'vehicle_id,component_key' });
    button.disabled = false;
    if (error) {
      setStatus(`Enregistrement impossible : ${error.message}`, true);
      return;
    }
    await loadDamagePricesAdmin();
    setStatus('Tarifs enregistrés pour ce véhicule.');
  }

  async function addCustomRow() {
    const input = $('damage-price-new-label');
    const label = input.value.trim();
    if (!label) {
      setStatus('Saisissez le nom de l’élément à ajouter.', true);
      input.focus();
      return;
    }
    if (rows.some(row => row.component_label.toLocaleLowerCase('fr') === label.toLocaleLowerCase('fr'))) {
      setStatus('Cet élément existe déjà pour ce véhicule.', true);
      input.focus();
      return;
    }
    const key = `custom_${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
    rows.push({ component_key: key, component_label: label, price: null, isCustom: true });
    input.value = '';
    render();
    setStatus('Élément ajouté à la liste. N’oubliez pas d’enregistrer les tarifs.');
  }

  async function deleteCustomRow(event) {
    const key = event.currentTarget.dataset.componentKey;
    const row = rows.find(item => item.component_key === key);
    if (!row || !confirm(`Supprimer « ${row.component_label} » de la liste de ce véhicule ?`)) return;
    setStatus('Suppression…');
    const { error } = await db.from('vehicle_damage_prices').delete().eq('vehicle_id', currentVehicleId).eq('component_key', key);
    if (error) {
      setStatus(`Suppression impossible : ${error.message}`, true);
      return;
    }
    rows = rows.filter(item => item.component_key !== key);
    render();
    setStatus('Élément supprimé.');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('damage-price-form')?.addEventListener('submit', saveDamagePrices);
    $('damage-price-vehicle')?.addEventListener('change', () => { currentVehicleId = $('damage-price-vehicle').value; loadDamagePricesAdmin(); });
    $('damage-price-add')?.addEventListener('click', addCustomRow);
    $('damage-price-refresh')?.addEventListener('click', loadDamagePricesAdmin);
    document.querySelector('.nav button[data-tab="damage-prices"]')?.addEventListener('click', loadDamagePricesAdmin);
    window.loadDamagePricesAdmin = loadDamagePricesAdmin;
  });
})();
