(() => {
  const $ = id => document.getElementById(id);
  let savedTripRates = [];
  const removedTripRateIds = new Set();
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const addRequiredStars = root => {
    (root || document).querySelectorAll('input[required],select[required],textarea[required]').forEach(input => {
      const field = input.closest('.field,.form-group'); const label = field?.querySelector('label');
      if (label && !label.querySelector('.required-star')) label.insertAdjacentHTML('beforeend', ' <span class="required-star" aria-hidden="true">*</span>');
    });
  };
  function ensureVehicleFields() {
    if ($('v-status') && !$('v-status').querySelector('option[value="contract_ended"]')) $('v-status').insertAdjacentHTML('beforeend', '<option value="contract_ended">Fin de contrat</option>');
    const status = $('v-status')?.closest('.field');
    if (status && !$('v-contract-start')) status.insertAdjacentHTML('afterend', '<div class="field"><label>Date de début du contrat</label><input id="v-contract-start" type="date"></div><div class="field"><label>Date de fin du contrat</label><input id="v-contract-end" type="date"></div>');
    const model = $('v-model')?.closest('.field');
    if (model && !$('v-fleet-group')) model.insertAdjacentHTML('afterend', '<div class="field"><label>Groupe de flotte (facultatif)</label><input id="v-fleet-group" placeholder="Ex. Kia Morning automatique"><small class="field-note">Utilise exactement le même nom sur toutes les unités comparables pour les regrouper au calendrier.</small></div>');
    const owner = $('v-owner-phone')?.closest('.field');
    if (owner && !$('v-owner-whatsapp-enabled')) owner.insertAdjacentHTML('beforeend', '<label class="checkbox-line" style="margin-top:8px"><input id="v-owner-whatsapp-enabled" type="checkbox"> Rediriger les demandes vers le WhatsApp du propriétaire</label><small class="field-note">Si cochée, le client remplit une demande courte puis WhatsApp s’ouvre vers ce numéro.</small>');
  }
  function updateClientDriverLabel() {
    const select = $('booking-vehicle'); const checkbox = $('booking-driver'); if (!select || !checkbox) return;
    const vehicle = window.bookingFleets?.find(group => group.id === select.value)?.vehicle || (window.bookingVehicles || []).find(v => v.id === select.value); const mode = vehicle?.driver_mode === 'with_driver' ? 'with_driver' : 'without_driver';
    let label = document.querySelector('[data-booking-mode-label]');
    if (!label) { label = document.createElement('span'); label.dataset.bookingModeLabel = '1'; label.className = 'booking-mode-label'; checkbox.closest('label')?.before(label); }
    label.textContent = mode === 'with_driver' ? 'Location avec chauffeur' : 'Location sans chauffeur';
    const wrapper = checkbox.closest('label'); if (wrapper) wrapper.lastChild.textContent = mode === 'with_driver' ? ' Ajouter un chauffeur supplémentaire' : ' Ajouter un chauffeur';
    const routeWrap = $('booking-trip-rate-wrap'); const routeSelect = $('booking-trip-rate');
    const rates = (vehicle?.trip_rates || []).filter(rate => Number(rate?.price_per_day ?? rate?.rate ?? 0) > 0);
    if (routeSelect) { const current = routeSelect.value; routeSelect.innerHTML = '<option value="">Choisir une destination</option>' + rates.map(item => { const label = item.label || [item.from,item.to].filter(Boolean).join(' → ') || 'Destination spéciale'; const amount = Number(item.price_per_day ?? item.rate ?? 0); return `<option value="${esc(item.id)}">${esc(label)} — ${formatMGA(amount)} / jour</option>`; }).join(''); routeSelect.value = rates.some(item => item.id === current) ? current : ''; }
    if (routeWrap) routeWrap.classList.toggle('hidden', mode !== 'with_driver' || !rates.length);
    const route = rates.find(item => item.id === routeSelect?.value); if (route) { if ($('booking-trip-from')) $('booking-trip-from').value = route.from || ''; if ($('booking-trip-to')) $('booking-trip-to').value = route.to || ''; }
    if (typeof updateBookingQuote === 'function') updateBookingQuote();
  }
  function renderTripRates(rates = []) {
    const wrap = $('v-trip-rates'); if (!wrap) return;
    const utils = window.RentCarTripRates;
    wrap.innerHTML = rates.map((rate, index) => {
      const label = rate.label || [rate.from, rate.to].filter(Boolean).join(' → ');
      const amount = Number(rate.rate ?? rate.price_per_day ?? 0);
      const id = utils?.idFor(rate, index) || rate.id || '';
      return `<div class="trip-rate-row" data-trip-id="${esc(id)}" data-trip-index="${index}" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:8px;margin:8px 0"><input data-trip-label class="trip-label" placeholder="Destination / trajet" value="${esc(label)}"><input data-trip-rate class="trip-rate" type="number" min="0" placeholder="Tarif / jour" value="${amount || ''}"><button type="button" class="btn danger" data-remove-trip>Supprimer</button></div>`;
    }).join('');
  }
  function readTripRateRows() {
    const utils = window.RentCarTripRates;
    return Array.from(document.querySelectorAll('#v-trip-rates .trip-rate-row')).map((row, index) => {
      const label = row.querySelector('[data-trip-label]')?.value.trim() || '';
      const id = row.dataset.tripId || utils?.slugFor(label) || `destination-${Date.now()}-${index}`;
      return {id, label, rate: Number(row.querySelector('[data-trip-rate]')?.value || 0)};
    });
  }
  function collectTripRates() {
    return readTripRateRows().filter(rate => rate.label && Number.isFinite(rate.rate) && rate.rate > 0);
  }
  function photoControls() {
    const preview = $('v-photo-preview'); const urlBox = $('v-photo-url'); if (!preview || !urlBox) return;
    const urls = urlBox.value.split('\n').map(x => x.trim()).filter(Boolean);
    preview.innerHTML = urls.map((url, index) => `<span class="photo-thumb"><img src="${esc(url)}" alt="Photo véhicule" style="width:84px;height:58px;object-fit:cover;border-radius:7px;border:1px solid var(--line)"><button type="button" data-photo-index="${index}" aria-label="Supprimer cette photo">×</button></span>`).join('');
  }
  function startVehicleForm() {
    const form = $('vehicle-form'); if (!form) return;
    ensureVehicleFields(); form.reset(); $('v-id').value = ''; savedTripRates = []; removedTripRateIds.clear(); if ($('v-driver-mode')) $('v-driver-mode').value = 'without_driver'; if ($('v-driver-fee')) $('v-driver-fee').value = 30000; if ($('v-extra-driver-fee')) $('v-extra-driver-fee').value = 30000; if ($('v-price-24h')) $('v-price-24h').value = ''; if ($('v-province-under-150-mode')) $('v-province-under-150-mode').value = 'quote'; if ($('v-province-over-150-mode')) $('v-province-over-150-mode').value = 'quote'; if ($('v-province-under-150-price')) $('v-province-under-150-price').value = ''; if ($('v-province-over-150-price')) $('v-province-over-150-price').value = ''; if ($('v-photo-url')) $('v-photo-url').value = ''; if ($('v-photo-file')) $('v-photo-file').value = ''; renderTripRates([]); photoControls(); form.classList.remove('hidden');
  }
  async function editVehicleForm(id) {
    ensureVehicleFields(); const result = await window.rentCarSupabase.from('vehicles').select('*').eq('id', id).single(); const v = result.data; if (result.error || !v) return alert(result.error?.message || 'Véhicule introuvable.');
    $('v-id').value = v.id; $('v-name').value = v.name || ''; $('v-registration').value = v.registration_number || ''; $('v-make').value = v.make || ''; $('v-model').value = v.model || ''; if ($('v-fleet-group')) $('v-fleet-group').value = v.fleet_group || ''; if ($('v-driver-mode')) $('v-driver-mode').value = v.driver_mode || 'without_driver'; $('v-price-12h').value = v.price_12h || v.price_per_day || 0; $('v-price-24h').value = v.price_24h ?? ''; if ($('v-province-under-150-mode')) $('v-province-under-150-mode').value = v.province_under_150_mode || 'quote'; if ($('v-province-over-150-mode')) $('v-province-over-150-mode').value = v.province_over_150_mode || 'quote'; if ($('v-province-under-150-price')) $('v-province-under-150-price').value = v.province_under_150_price ?? ''; if ($('v-province-over-150-price')) $('v-province-over-150-price').value = v.province_over_150_price ?? ''; if ($('v-driver-fee')) $('v-driver-fee').value = v.driver_fee ?? 30000; if ($('v-extra-driver-fee')) $('v-extra-driver-fee').value = v.extra_driver_fee ?? 30000; $('v-price').value = v.price_per_day || v.price_12h || 0; $('v-transmission').value = v.transmission || ''; $('v-fuel').value = v.fuel || ''; $('v-seats').value = v.seats || ''; $('v-status').value = v.status || 'available'; $('v-description').value = v.description || ''; $('v-owner-name').value = v.owner_name || ''; if ($('v-owner-first-name')) $('v-owner-first-name').value = v.owner_first_name || ''; $('v-owner-phone').value = v.owner_phone || ''; if ($('v-owner-address')) $('v-owner-address').value = v.owner_address || ''; if ($('v-owner-nif')) $('v-owner-nif').value = v.owner_nif || ''; if ($('v-owner-stat')) $('v-owner-stat').value = v.owner_stat || ''; if ($('v-contract-start')) $('v-contract-start').value = v.contract_start_date || ''; if ($('v-contract-end')) $('v-contract-end').value = v.contract_end_date || ''; if ($('v-owner-whatsapp-enabled')) $('v-owner-whatsapp-enabled').checked = !!v.owner_whatsapp_enabled; if ($('v-photo-url')) $('v-photo-url').value = (v.image_urls || []).join('\n'); if ($('v-photo-file')) $('v-photo-file').value = ''; savedTripRates = window.RentCarTripRates.merge(v.trip_rates || [], [], []); removedTripRateIds.clear(); renderTripRates(savedTripRates); photoControls(); $('vehicle-form').classList.remove('hidden'); $('vehicle-form').scrollIntoView({behavior:'smooth'});
  }
  async function openMaintenanceForVehicle(id) {
    const form = $('maintenance-form'); if (!form) return alert('Formulaire de maintenance introuvable.');
    const current = await window.rentCarSupabase.from('vehicles').select('status').eq('id', id).single();
    if (current.data?.status === 'maintenance') { const result = await window.rentCarSupabase.from('vehicles').update({status:'available'}).eq('id', id); if (result.error) return alert(result.error.message); if (typeof refreshAll === 'function') await refreshAll(); return; }
    if (form.classList.contains('hidden')) form.classList.remove('hidden'); if ($('m-vehicle')) $('m-vehicle').value = id;
    const now = new Date(); const end = new Date(now.getTime() + 24 * 3600000); const isoLocal = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);
    if ($('m-start') && !$('m-start').value) $('m-start').value = isoLocal(now); if ($('m-end') && !$('m-end').value) $('m-end').value = isoLocal(end); if ($('m-date') && !$('m-date').value) $('m-date').value = now.toISOString().slice(0,10);
    document.getElementById('maintenance')?.scrollIntoView({behavior:'smooth'});
  }

  function openFleetGroupForm() {
    const existing = $('fleet-group-form'); if (existing) { existing.classList.remove('hidden'); existing.scrollIntoView({behavior:'smooth'}); return; }
    const list = (window.vehicles || []).filter(v => v.status !== 'contract_ended');
    const host = $('vehicles-table')?.parentElement;
    if (!host) return alert('Interface des véhicules introuvable.');
    const form = document.createElement('form'); form.id='fleet-group-form'; form.className='card'; form.style='margin:16px 0;border:2px solid var(--gold,#d9a441)';
    form.innerHTML = `<div class="section-head"><h3>Créer un groupe de voitures</h3><button type="button" class="btn outline" data-close-group>Fermer</button></div><p class="muted">Donnez un nom au groupe puis cochez les voitures à regrouper. Elles apparaîtront comme une seule voiture côté client.</p><div class="field"><label>Nom du groupe</label><input id="fleet-group-name" required placeholder="Ex. Kia Morning automatique"></div><div class="fleet-group-choices">${list.map(v=>`<label class="checkbox-line"><input type="checkbox" value="${esc(v.id)}"> ${esc(v.name)}${v.registration_number?` — ${esc(v.registration_number)}`:''}</label>`).join('') || '<p class="empty">Aucune voiture disponible.</p>'}</div><div class="actions" style="margin-top:14px"><button class="btn primary" type="submit">Enregistrer le groupe</button><button class="btn outline" type="button" data-close-group>Annuler</button></div>`;
    host.insertBefore(form, $('vehicles-table'));
    form.querySelectorAll('[data-close-group]').forEach(btn=>btn.addEventListener('click',()=>form.remove()));
    form.addEventListener('submit', async e=>{
      e.preventDefault(); const name=$('fleet-group-name').value.trim(); const ids=[...form.querySelectorAll('input[type=checkbox]:checked')].map(x=>x.value);
      if (!name) return alert('Saisissez le nom du groupe.'); if (ids.length < 1) return alert('Sélectionnez au moins une voiture.');
      const result=await window.rentCarSupabase.from('vehicles').update({fleet_group:name}).in('id',ids);
      if (result.error) return alert(`Impossible de créer le groupe : ${result.error.message}`);
      form.remove(); if (typeof refreshAll==='function') await refreshAll();
    });
  }

  function installAdmin() {
    ensureVehicleFields(); addRequiredStars(document);
    $('create-fleet-group')?.addEventListener('click', openFleetGroupForm);
    const urlBox = $('v-photo-url'); urlBox?.addEventListener('input', photoControls);
    $('add-trip-rate')?.addEventListener('click', () => { const rates = readTripRateRows(); rates.push({id: `destination-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, label:'', rate:0}); renderTripRates(rates); $('v-trip-rates .trip-rate-row:last-child [data-trip-label]')?.focus(); });
    $('v-trip-rates')?.addEventListener('click', e => { const button = e.target.closest('[data-remove-trip]'); if (!button) return; const row = button.closest('.trip-rate-row'); const id = row?.dataset.tripId; if (id && savedTripRates.some(rate => rate.id === id)) removedTripRateIds.add(id); row?.remove(); });
    $('v-photo-preview')?.addEventListener('click', async e => { const button = e.target.closest('[data-photo-index]'); if (!button) return; const urls = urlBox.value.split('\n').map(x => x.trim()).filter(Boolean); const removed = urls.splice(Number(button.dataset.photoIndex), 1)[0]; urlBox.value = urls.join('\n'); photoControls(); const marker = '/vehicle-images/'; const index = removed.indexOf(marker); if (index >= 0) await window.rentCarSupabase.storage.from('vehicle-images').remove([decodeURIComponent(removed.slice(index + marker.length).split('?')[0])]); });
    $('v-photo-file')?.addEventListener('change', () => { const files = Array.from($('v-photo-file').files || []); const note = $('v-photo-preview'); if (files.length) note.insertAdjacentHTML('beforeend', `<span class="photo-thumb"><span style="padding:18px 8px;border:1px dashed var(--line)">${files.length} nouvelle(s) photo(s)</span></span>`); });
    const form = $('vehicle-form');
    form?.addEventListener('submit', async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      const id = $('v-id').value; const price12h = Number($('v-price-12h').value || 0); const price24Input = $('v-price-24h').value.trim(); const price24h = price24Input === '' ? null : Number(price24Input); const dailyInput = $('v-price').value.trim(); const dailyPrice = dailyInput === '' ? price12h : Number(dailyInput);
      if (!Number.isFinite(price12h) || price12h <= 0) return alert('Le tarif 12 h est obligatoire et doit être supérieur à zéro.');
      if (price24h !== null && (!Number.isFinite(price24h) || price24h <= 0)) return alert('Le tarif 24 h doit être supérieur à zéro ou laissé vide pour afficher « Sur devis ».');
      if (!Number.isFinite(dailyPrice) || dailyPrice < 0) return alert('Le tarif affiché par jour doit être un nombre positif ou nul.');
      const currentRoutes = id ? await window.rentCarSupabase.from('vehicles').select('trip_rates').eq('id', id).single() : {data:{trip_rates:[]},error:null};
      if (currentRoutes.error) return alert(`Impossible de relire les destinations enregistrées : ${currentRoutes.error.message}`);
      const routeRows = readTripRateRows();
      const incompleteRoute = routeRows.find(route => (route.label || route.rate > 0) && (!route.label || !Number.isFinite(route.rate) || route.rate <= 0));
      if (incompleteRoute) return alert('Chaque destination commencée doit avoir un nom et un tarif supérieur à zéro.');
      const editedRoutes = collectTripRates();
      const mergedTripRates = window.RentCarTripRates.merge(currentRoutes.data?.trip_rates || [], editedRoutes, Array.from(removedTripRateIds));
      const payload = {name:$('v-name').value.trim(),slug:$('v-name').value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'),registration_number:$('v-registration').value.trim()||null,make:$('v-make').value.trim(),model:$('v-model').value.trim(),fleet_group:$('v-fleet-group')?.value.trim()||null,driver_mode:$('v-driver-mode')?.value || 'without_driver',driver_fee:Number($('v-driver-fee')?.value || 0),extra_driver_fee:Number($('v-extra-driver-fee')?.value || 0),province_under_150_mode:$('v-province-under-150-mode')?.value || 'quote',province_under_150_price:($('v-province-under-150-mode')?.value === 'price' && $('v-province-under-150-price')?.value.trim() !== '') ? Number($('v-province-under-150-price').value) : null,province_over_150_mode:$('v-province-over-150-mode')?.value || 'quote',province_over_150_price:($('v-province-over-150-mode')?.value === 'price' && $('v-province-over-150-price')?.value.trim() !== '') ? Number($('v-province-over-150-price').value) : null,trip_rates:mergedTripRates,price_12h:price12h,price_24h:price24h,price_per_day:dailyPrice,transmission:$('v-transmission').value,fuel:$('v-fuel').value,seats:Number($('v-seats').value)||null,status:$('v-status').value,description:$('v-description').value,owner_name:$('v-owner-name').value.trim()||null,owner_first_name:$('v-owner-first-name')?.value.trim()||null,owner_phone:$('v-owner-phone').value.trim()||null,owner_address:$('v-owner-address')?.value.trim()||null,owner_nif:$('v-owner-nif')?.value.trim()||null,owner_stat:$('v-owner-stat')?.value.trim()||null,contract_start_date:$('v-contract-start')?.value || null,contract_end_date:$('v-contract-end')?.value || null,owner_whatsapp_enabled:!!$('v-owner-whatsapp-enabled')?.checked};
      const response = id ? await window.rentCarSupabase.from('vehicles').update(payload).eq('id', id).select('id').single() : await window.rentCarSupabase.from('vehicles').insert(payload).select('id').single();
      if (response.error) return alert(response.error.message); const vehicleId = response.data.id;
      savedTripRates = mergedTripRates; removedTripRateIds.clear();
      const files = Array.from($('v-photo-file').files || []); const urls = $('v-photo-url').value.split('\n').map(x => x.trim()).filter(Boolean);
      for (const file of files) { const safe = file.name.replace(/[^a-zA-Z0-9._-]/g,'-'); const path = `${vehicleId}/${Date.now()}-${safe}`; const upload = await window.rentCarSupabase.storage.from('vehicle-images').upload(path,file,{upsert:false,contentType:file.type}); if (!upload.error) urls.push(window.rentCarSupabase.storage.from('vehicle-images').getPublicUrl(path).data.publicUrl); }
      const imageUpdate = await window.rentCarSupabase.from('vehicles').update({image_urls:urls}).eq('id', vehicleId); if (imageUpdate.error) alert(imageUpdate.error.message);
      form.reset(); $('v-id').value=''; form.classList.add('hidden'); if (typeof refreshAll === 'function') await refreshAll();
    }, true);
    $('maintenance-form')?.addEventListener('submit', async event => { const vehicleId = $('m-vehicle')?.value; if (vehicleId) await window.rentCarSupabase.from('vehicles').update({status:'maintenance'}).eq('id', vehicleId); }, true);
    // Ne pas observer v-photo-preview : photoControls() réécrit innerHTML et provoquerait une boucle infinie.
  }
  document.addEventListener('DOMContentLoaded', () => {
    addRequiredStars(document); ensureVehicleFields(); updateClientDriverLabel(); $('booking-vehicle')?.addEventListener('change', updateClientDriverLabel); installAdmin();
    window.startAddVehicle = startVehicleForm; window.openMaintenanceForVehicle = openMaintenanceForVehicle;
    window.editVehicle = async id => { try { await editVehicleForm(id); } catch (error) { console.error('Erreur modification véhicule', error); alert(`Impossible d’ouvrir le véhicule : ${error.message}`); } };
    window.toggleVehicleStatus = openMaintenanceForVehicle;
  });
  window.updateClientDriverLabel = updateClientDriverLabel;
})();
