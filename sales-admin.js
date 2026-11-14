(() => {
  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels = { new:'Brouillon', contacted:'Contactée', accepted:'Publié', rejected:'Refusée', archived:'Archivée' };
  const val = id => $(id)?.value.trim() || null;
  const money = value => value ? `${Number(value).toLocaleString('fr-FR')} Ar` : 'Prix à définir';
  const setValue = (id, value) => { const field = $(id); if (field) field.value = value ?? ''; };

  async function loadVehicleSales() {
    const target = $('sales-table');
    if (!target || !db) return;
    const { data, error } = await db.from('vehicle_sales').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) { target.innerHTML = `<div class="notice">Impossible de charger les annonces : ${esc(error.message)}</div>`; return; }
    window.vehicleSalesCache = data || [];
    target.innerHTML = (data || []).map(s => {
      const photos = Object.values(s.photo_urls || {}).filter(Boolean).map(url => `<img class="sale-admin-thumb" src="${esc(url)}" alt="Photo voiture">`).join('');
      return `<article class="sale-admin-card"><div class="sale-admin-card-head"><div><strong>${esc(s.make)} ${esc(s.model)}</strong> ${s.year ? `(${s.year})` : ''}<br><small>${esc(s.seller_name)} · ${esc(s.seller_phone)}</small></div><div class="sale-admin-card-actions"><button type="button" class="btn outline" onclick="window.editVehicleSale('${esc(s.id)}')"><i class="fas fa-pen"></i> Modifier</button><select class="sale-status-select" aria-label="Statut de l’annonce" onchange="window.updateVehicleSale('${esc(s.id)}',this.value)">${Object.entries(labels).map(([key, label]) => `<option value="${key}" ${s.status === key ? 'selected' : ''}>${label}</option>`).join('')}</select></div></div><div class="sale-admin-photos">${photos || '<span class="muted">Aucune photo</span>'}</div><p class="sale-admin-card-description">${esc(s.description || 'Description non renseignée.')}</p><small>${s.mileage_km ? Number(s.mileage_km).toLocaleString('fr-FR') + ' km' : 'Kilométrage à vérifier'} · ${money(s.asking_price)} · ${esc(s.transmission || 'Transmission à vérifier')} · ${esc(s.fuel || 'Carburant à vérifier')}</small></article>`;
    }).join('') || '<div class="empty">Aucune annonce.</div>';
  }

  async function updateVehicleSale(id, status) {
    const { error } = await db.from('vehicle_sales').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) alert(error.message); else loadVehicleSales();
  }

  function resetForm() {
    const form = $('admin-sale-form');
    if (!form) return;
    form.reset();
    setValue('admin-sale-id', '');
    const button = form.querySelector('button[type="submit"]');
    if (button) button.textContent = 'Enregistrer l’annonce';
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function editVehicleSale(id) {
    const record = window.vehicleSalesCache?.find(item => item.id === id);
    if (!record) return loadVehicleSales().then(() => alert('Actualisez la section Ventes puis cliquez à nouveau sur Modifier.'));
    setValue('admin-sale-id', record.id); setValue('admin-sale-make', record.make); setValue('admin-sale-model', record.model); setValue('admin-sale-year', record.year); setValue('admin-sale-price', record.asking_price); setValue('admin-sale-mileage', record.mileage_km); setValue('admin-sale-transmission', record.transmission); setValue('admin-sale-fuel', record.fuel); setValue('admin-sale-seats', record.seats); setValue('admin-sale-description', record.description); setValue('admin-sale-repairs', record.repairs_needed); setValue('admin-sale-status', record.status); setValue('admin-sale-seller', record.seller_name); setValue('admin-sale-phone', record.seller_phone); setValue('admin-sale-email', record.seller_email); setValue('admin-sale-address', record.seller_address); setValue('admin-sale-registration', record.registration_card_status); setValue('admin-sale-insurance', record.insurance_status); setValue('admin-sale-inspection', record.inspection_status); setValue('admin-sale-pink', record.pink_card_status); setValue('admin-sale-model1', record.model_1_status);
    const form = $('admin-sale-form'); const button = form?.querySelector('button[type="submit"]'); if (button) button.textContent = 'Enregistrer les modifications'; form?.classList.remove('hidden'); form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveSale(event) {
    event.preventDefault();
    const form = event.target, button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const id = val('admin-sale-id');
      const payload = { seller_name: val('admin-sale-seller'), seller_phone: val('admin-sale-phone'), seller_email: val('admin-sale-email'), seller_address: val('admin-sale-address'), make: val('admin-sale-make'), model: val('admin-sale-model'), year: Number(val('admin-sale-year')) || null, asking_price: Number(val('admin-sale-price')) || null, mileage_km: Number(val('admin-sale-mileage')) || null, description: val('admin-sale-description'), repairs_needed: val('admin-sale-repairs'), transmission: val('admin-sale-transmission'), fuel: val('admin-sale-fuel'), seats: Number(val('admin-sale-seats')) || null, status: val('admin-sale-status'), registration_card_status: val('admin-sale-registration'), insurance_status: val('admin-sale-insurance'), inspection_status: val('admin-sale-inspection'), pink_card_status: val('admin-sale-pink'), model_1_status: val('admin-sale-model1'), updated_at: new Date().toISOString() };
      const result = id
        ? await db.from('vehicle_sales').update(payload).eq('id', id)
        : await db.from('vehicle_sales').insert(payload).select('id').single();
      if (result.error) throw new Error(result.error.message);
      const saleId = id || result.data?.id;
      if (!saleId) throw new Error('Identifiant de l’annonce introuvable après l’enregistrement.');
      const files = Array.from($('admin-sale-photos').files || []).slice(0, 6), urls = {};
      for (const file of files) { const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-'), path = `${saleId}/${Date.now()}-${safe}`, upload = await db.storage.from('vehicle-sales').upload(path, file, { upsert: false, contentType: file.type }); if (upload.error) throw new Error(upload.error.message); urls[file.name] = db.storage.from('vehicle-sales').getPublicUrl(path).data.publicUrl; }
      if (Object.keys(urls).length) { const photoUpdate = await db.from('vehicle_sales').update({ photo_urls: urls, updated_at: new Date().toISOString() }).eq('id', saleId); if (photoUpdate.error) throw new Error(photoUpdate.error.message); }
      form.reset(); setValue('admin-sale-id', ''); form.classList.add('hidden'); await loadVehicleSales();
    } catch (error) { alert(`Annonce non enregistrée : ${error.message}`); } finally { button.disabled = false; }
  }

  window.loadVehicleSales = loadVehicleSales;
  window.updateVehicleSale = updateVehicleSale;
  window.editVehicleSale = editVehicleSale;
  document.addEventListener('DOMContentLoaded', () => { $('sale-add')?.addEventListener('click', resetForm); $('admin-sale-form')?.addEventListener('submit', saveSale); setTimeout(loadVehicleSales, 500); });
})();
