(() => {
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const getVehicles = () => typeof vehicles !== 'undefined' ? vehicles : (window.vehicles || []);
  const getDatabase = () => typeof db !== 'undefined' ? db : window.rentCarSupabase;
  let contacts = [];
  let editingKey = null;

  function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) return digits.slice(2);
    if (digits.startsWith('0')) return `261${digits.slice(1)}`;
    return digits;
  }

  function displayName(vehicle) {
    return [vehicle.owner_name, vehicle.owner_first_name].filter(Boolean).join(' ').trim() || 'Contact sans nom';
  }

  function contactKey(vehicle) {
    const phone = normalizePhone(vehicle.owner_phone);
    return phone ? `phone:${phone}` : `name:${displayName(vehicle).toLocaleLowerCase('fr-FR')}`;
  }

  function makeContacts() {
    const grouped = new Map();
    getVehicles().filter(vehicle => String(vehicle.owner_name || '').trim() || String(vehicle.owner_phone || '').trim()).forEach(vehicle => {
      const key = contactKey(vehicle);
      if (!grouped.has(key)) grouped.set(key, {
        key,
        name: displayName(vehicle),
        lastName: vehicle.owner_name || '',
        firstName: vehicle.owner_first_name || '',
        phone: vehicle.owner_phone || '',
        address: vehicle.owner_address || '',
        nif: vehicle.owner_nif || '',
        stat: vehicle.owner_stat || '',
        vehicles: [],
        whatsappEnabled: true,
      });
      const contact = grouped.get(key);
      contact.vehicles.push(vehicle);
      contact.whatsappEnabled = contact.whatsappEnabled && Boolean(vehicle.owner_whatsapp_enabled);
    });
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }

  function vehicleLabel(vehicle) {
    const model = [vehicle.make, vehicle.model].filter(Boolean).join(' ');
    const name = vehicle.name || model || 'Voiture';
    const registration = vehicle.registration_number ? ` — ${vehicle.registration_number}` : '';
    return `${name}${model && name !== model ? ` (${model})` : ''}${registration}`;
  }

  function renderVehicleOptions(selectedIds = []) {
    const select = $('owner-vehicles');
    if (!select) return;
    const allVehicles = getVehicles().slice().sort((a, b) => vehicleLabel(a).localeCompare(vehicleLabel(b), 'fr'));
    select.innerHTML = allVehicles.map(vehicle => `<option value="${escapeHtml(vehicle.id)}">${escapeHtml(vehicleLabel(vehicle))}${vehicle.owner_name ? ` · Actuellement : ${escapeHtml(displayName(vehicle))}` : ''}</option>`).join('');
    const selected = new Set(selectedIds);
    [...select.options].forEach(option => { option.selected = selected.has(option.value); });
  }

  function renderContacts() {
    const target = $('owners-table');
    if (!target) return;
    contacts = makeContacts();
    renderVehicleOptions();
    if (!contacts.length) {
      target.innerHTML = '<div class="empty">Aucun propriétaire ou prestataire n’est encore affecté à une voiture. Utilisez le formulaire ci-dessus pour commencer.</div>';
      return;
    }
    target.innerHTML = `<table class="table"><thead><tr><th>Contact</th><th>Téléphone / WhatsApp</th><th>Voitures attribuées</th><th>Routage WhatsApp</th><th>Action</th></tr></thead><tbody>${contacts.map((contact, index) => `<tr><td><strong>${escapeHtml(contact.name)}</strong></td><td>${escapeHtml(contact.phone || '—')}</td><td>${contact.vehicles.map(vehicle => escapeHtml(vehicleLabel(vehicle))).join('<br>')}</td><td>${contact.whatsappEnabled ? 'Activé' : 'Désactivé'}</td><td><button type="button" class="btn outline" data-owner-edit="${index}">Modifier</button></td></tr>`).join('')}</tbody></table>`;
  }

  function clearForm() {
    const form = $('owner-assignment-form');
    if (!form) return;
    form.reset();
    editingKey = null;
    $('owner-whatsapp-enabled').checked = true;
    $('owner-unassign')?.classList.add('hidden');
    $('owner-assignment-title').textContent = 'Ajouter un propriétaire ou prestataire';
    $('owner-assignment-save').textContent = 'Enregistrer et attribuer';
    $('owner-assignment-result').textContent = '';
    renderVehicleOptions();
  }

  function editContact(index) {
    const contact = contacts[index];
    if (!contact) return;
    editingKey = contact.key;
    $('owner-name').value = contact.lastName;
    $('owner-first-name').value = contact.firstName;
    $('owner-phone').value = contact.phone;
    $('owner-address').value = contact.address;
    $('owner-nif').value = contact.nif;
    $('owner-stat').value = contact.stat;
    $('owner-whatsapp-enabled').checked = contact.whatsappEnabled;
    $('owner-unassign')?.classList.remove('hidden');
    $('owner-assignment-title').textContent = 'Modifier le contact et ses voitures';
    $('owner-assignment-save').textContent = 'Enregistrer les modifications';
    $('owner-assignment-result').textContent = '';
    renderVehicleOptions(contact.vehicles.map(vehicle => vehicle.id));
    $('owner-assignment-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function saveAssignment(event) {
    event.preventDefault();
    const result = $('owner-assignment-result');
    const selectedIds = [...$('owner-vehicles').selectedOptions].map(option => option.value);
    if (!selectedIds.length) {
      result.textContent = 'Sélectionnez au moins une voiture.';
      return;
    }
    const lastName = $('owner-name').value.trim();
    const firstName = $('owner-first-name').value.trim();
    const phone = $('owner-phone').value.trim();
    if (!lastName || !phone) {
      result.textContent = 'Le nom et le numéro WhatsApp sont obligatoires.';
      return;
    }
    const database = getDatabase();
    const currentContact = editingKey ? contacts.find(contact => contact.key === editingKey) : null;
    const previousIds = currentContact ? currentContact.vehicles.map(vehicle => vehicle.id) : [];
    const toRemove = previousIds.filter(id => !selectedIds.includes(id));
    const assigned = await database.from('vehicles').update({
      owner_name: lastName,
      owner_first_name: firstName || null,
      owner_phone: phone,
      owner_address: $('owner-address').value.trim() || null,
      owner_nif: $('owner-nif').value.trim() || null,
      owner_stat: $('owner-stat').value.trim() || null,
      owner_whatsapp_enabled: $('owner-whatsapp-enabled').checked,
    }).in('id', selectedIds);
    if (assigned.error) {
      result.textContent = `Impossible d’enregistrer l’affectation : ${assigned.error.message}`;
      return;
    }
    if (toRemove.length) {
      const cleared = await database.from('vehicles').update({ owner_name: null, owner_first_name: null, owner_phone: null, owner_address: null, owner_nif: null, owner_stat: null, owner_whatsapp_enabled: false }).in('id', toRemove);
      if (cleared.error) {
        result.textContent = `Les nouvelles affectations sont enregistrées, mais le retrait de certaines anciennes voitures a échoué : ${cleared.error.message}`;
        await window.refreshAll?.();
        renderContacts();
        return;
      }
    }
    result.textContent = 'Contact et affectations enregistrés.';
    await window.refreshAll?.();
    renderContacts();
    clearForm();
  }

  async function removeContactAssignments() {
    const contact = contacts.find(item => item.key === editingKey);
    if (!contact || !window.confirm(`Retirer ${contact.name} des voitures qui lui sont attribuées ?`)) return;
    const result = $('owner-assignment-result');
    const ids = contact.vehicles.map(vehicle => vehicle.id);
    const { error } = await getDatabase().from('vehicles').update({ owner_name: null, owner_first_name: null, owner_phone: null, owner_address: null, owner_nif: null, owner_stat: null, owner_whatsapp_enabled: false }).in('id', ids);
    if (error) {
      result.textContent = `Impossible de retirer l’affectation : ${error.message}`;
      return;
    }
    await window.refreshAll?.();
    renderContacts();
    clearForm();
  }

  document.querySelector('.nav button[data-tab="owners"]')?.addEventListener('click', renderContacts);
  $('owner-assignment-form')?.addEventListener('submit', saveAssignment);
  $('owner-new')?.addEventListener('click', clearForm);
  $('owner-unassign')?.addEventListener('click', removeContactAssignments);
  $('owners-table')?.addEventListener('click', event => {
    const button = event.target.closest('[data-owner-edit]');
    if (button) editContact(Number(button.dataset.ownerEdit));
  });

  renderVehicleOptions();
  renderContacts();
})();
