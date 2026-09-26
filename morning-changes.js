(() => {
  const $ = id => document.getElementById(id);
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
    wrap.innerHTML = rates.map((rate, index) => { const label = rate.label || [rate.from, rate.to].filter(Boolean).join(' → '); const amount = Number(rate.rate ?? rate.price_per_day ?? 0); return `<div class="trip-rate-row" data-trip-id="${esc(rate.id || '')}" data-trip-index="${index}" style="display:grid;grid-template-columns:1.5fr 1fr auto;gap:8px;margin:8px 0"><input data-trip-label class="trip-label" placeholder="Destination / trajet" value="${esc(label)}"><input data-trip-rate class="trip-rate" type="number" min="0" placeholder="Tarif / jour" value="${amount||''}"><button type="button" class="btn danger" data-remove-trip>Supprimer</button></div>`; }).join('');
  }
  function collectTripRates() { return Array.from(document.querySelectorAll('#v-trip-rates .trip-rate-row')).map(row => ({id: row.dataset.tripId || (row.querySelector('[data-trip-label]')?.value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'), label: row.querySelector('[data-trip-label]')?.value.trim() || '', rate: Number(row.querySelector('[data-trip-rate]')?.value || 0)})).filter(rate => rate.label && rate.rate > 0); }
  function photoControls() {
    const preview = $('v-photo-preview'); const urlBox = $('v-photo-url'); if (!preview || !urlBox) return;
    const urls = urlBox.value.split('\n').map(x => x.trim()).filter(Boolean);
    preview.innerHTML = urls.map((url, index) => `<span class="photo-thumb"><img src="${esc(url)}" alt="Photo véhicule" style="width:84px;height:58px;object-fit:cover;border-radius:7px;border:1px solid var(--line)"><button type="button" data-photo-index="${index}" aria-label="Supprimer cette photo">×</button></span>`).join('');
  }
  function startVehicleForm() {
    const form = $('vehicle-form'); if (!form) return;
    ensureVehicleFields(); form.reset(); $('v-id').value = ''; if ($('v-driver-mode')) $('v-driver-mode').value = 'without_driver'; if ($('v-driver-fee')) $('v-driver-fee').value = 30000; if ($('v-extra-driver-fee')) $('v-extra-driver-fee').value = 30000; if ($('v-price-24h')) $('v-price-24h').value = ''; if ($('v-photo-url')) $('v-photo-url').value = ''; if ($('v-photo-file')) $('v-photo-file').value = ''; renderTripRates([]); photoControls(); form.classList.remove('hidden');
  }
  async function editVehicleForm(id) {
    ensureVehicleFields(); const result = await window.rentCarSupabase.from('vehicles').select('*').eq('id', id).single(); const v = result.data; if (result.error || !v) return alert(result.error?.message || 'Véhicule introuvable.');
    $('v-id').value = v.id; $('v-name').value = v.name || ''; $('v-registration').value = v.registration_number || ''; $('v-make').value = v.make || ''; $('v-model').value = v.model || ''; if ($('v-fleet-group')) $('v-fleet-group').value = v.fleet_group || ''; if ($('v-driver-mode')) $('v-driver-mode').value = v.driver_mode || 'without_driver'; $('v-price-12h').value = v.price_12h || v.price_per_day || 0; $('v-price-24h').value = v.price_24h ?? ''; if ($('v-driver-fee')) $('v-driver-fee').value = v.driver_fee ?? 30000; if ($('v-extra-driver-fee')) $('v-extra-driver-fee').value = v.extra_driver_fee ?? 30000; $('v-price').value = v.price_per_day || v.price_12h || 0; $('v-transmission').value = v.transmission || ''; $('v-fuel').value = v.fuel || ''; $('v-seats').value = v.seats || ''; $('v-status').value = v.status || 'available'; $('v-description').value = v.description || ''; $('v-owner-name').value = v.owner_name || ''; $('v-owner-phone').value = v.owner_phone || ''; if ($('v-contract-start')) $('v-contract-start').value = v.contract_start_date || ''; if ($('v-contract-end')) $('v-contract-end').value = v.contract_end_date || ''; if ($('v-owner-whatsapp-enabled')) $('v-owner-whatsapp-enabled').checked = !!v.owner_whatsapp_enabled; if ($('v-photo-url')) $('v-photo-url').value = (v.image_urls || []).join('\n'); if ($('v-photo-file')) $('v-photo-file').value = ''; renderTripRates(v.trip_rates || []); photoControls(); $('vehicle-form').classList.remove('hidden'); $('vehicle-form').scrollIntoView({behavior:'smooth'});
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
  function installAdmin() {
    ensureVehicleFields(); addRequiredStars(document);
    const urlBox = $('v-photo-url'); urlBox?.addEventListener('input', photoControls);
    $('add-trip-rate')?.addEventListener('click', () => { const rates = collectTripRates(); rates.push({from:'',to:'',price_per_day:0}); renderTripRates(rates); });
    $('v-trip-rates')?.addEventListener('click', e => { if (e.target.closest('[data-remove-trip]')) e.target.closest('.trip-rate-row').remove(); });
    $('v-photo-preview')?.addEventListener('click', async e => { const button = e.target.closest('[data-photo-index]'); if (!button) return; const urls = urlBox.value.split('\n').map(x => x.trim()).filter(Boolean); const removed = urls.splice(Number(button.dataset.photoIndex), 1)[0]; urlBox.value = urls.join('\n'); photoControls(); const marker = '/vehicle-images/'; const index = removed.indexOf(marker); if (index >= 0) await window.rentCarSupabase.storage.from('vehicle-images').remove([decodeURIComponent(removed.slice(index + marker.length).split('?')[0])]); });
    $('v-photo-file')?.addEventListener('change', () => { const files = Array.from($('v-photo-file').files || []); const note = $('v-photo-preview'); if (files.length) note.insertAdjacentHTML('beforeend', `<span class="photo-thumb"><span style="padding:18px 8px;border:1px dashed var(--line)">${files.length} nouvelle(s) photo(s)</span></span>`); });
    const form = $('vehicle-form');
    form?.addEventListener('submit', async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      const id = $('v-id').value; const price12h = Number($('v-price-12h').value || 0); const price24Input = $('v-price-24h').value.trim(); const price24h = price24Input === '' ? null : Number(price24Input); const dailyInput = $('v-price').value.trim(); const dailyPrice = dailyInput === '' ? price12h : Number(dailyInput);
      if (!Number.isFinite(price12h) || price12h <= 0) return alert('Le tarif 12 h est obligatoire et doit être supérieur à zéro.');
      if (price24h !== null && (!Number.isFinite(price24h) || price24h <= 0)) return alert('Le tarif 24 h doit être supérieur à zéro ou laissé vide pour afficher « Sur devis ».');
      if (!Number.isFinite(dailyPrice) || dailyPrice < 0) return alert('Le tarif affiché par jour doit être un nombre positif ou nul.');
      const payload = {name:$('v-name').value.trim(),slug:$('v-name').value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'),registration_number:$('v-registration').value.trim()||null,make:$('v-make').value.trim(),model:$('v-model').value.trim(),fleet_group:$('v-fleet-group')?.value.trim()||null,driver_mode:$('v-driver-mode')?.value || 'without_driver',driver_fee:Number($('v-driver-fee')?.value || 0),extra_driver_fee:Number($('v-extra-driver-fee')?.value || 0),trip_rates:collectTripRates(),price_12h:price12h,price_24h:price24h,price_per_day:dailyPrice,transmission:$('v-transmission').value,fuel:$('v-fuel').value,seats:Number($('v-seats').value)||null,status:$('v-status').value,description:$('v-description').value,owner_name:$('v-owner-name').value.trim()||null,owner_phone:$('v-owner-phone').value.trim()||null,contract_start_date:$('v-contract-start')?.value || null,contract_end_date:$('v-contract-end')?.value || null,owner_whatsapp_enabled:!!$('v-owner-whatsapp-enabled')?.checked};
      const response = id ? await window.rentCarSupabase.from('vehicles').update(payload).eq('id', id).select('id').single() : await window.rentCarSupabase.from('vehicles').insert(payload).select('id').single();
      if (response.error) return alert(response.error.message); const vehicleId = response.data.id;
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
