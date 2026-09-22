(() => {
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const addRequiredStars = root => {
    (root || document).querySelectorAll('input[required],select[required],textarea[required]').forEach(input => {
      const field = input.closest('.field,.form-group'); const label = field?.querySelector('label');
      if (label && !label.querySelector('.required-star')) label.insertAdjacentHTML('beforeend', ' <span class="required-star" aria-hidden="true">*</span>');
    });
  };
  function updateClientDriverLabel() {
    const select = $('booking-vehicle'); const checkbox = $('booking-driver'); if (!select || !checkbox) return;
    const vehicle = (window.bookingVehicles || []).find(v => v.id === select.value); const mode = vehicle?.driver_mode === 'with_driver' ? 'with_driver' : 'without_driver';
    let label = document.querySelector('[data-booking-mode-label]');
    if (!label) { label = document.createElement('span'); label.dataset.bookingModeLabel = '1'; label.className = 'booking-mode-label'; checkbox.closest('label')?.before(label); }
    label.textContent = mode === 'with_driver' ? 'Location avec chauffeur' : 'Location en sans chauffeur';
    const wrapper = checkbox.closest('label'); if (wrapper) wrapper.lastChild.textContent = mode === 'with_driver' ? ' Ajouter un chauffeur supplémentaire' : ' Ajouter un chauffeur';
    let routeWrap = $('booking-trip-rate-wrap');
    if (!routeWrap) { const anchor = $('booking-trip-from')?.closest('label'); if (anchor) { routeWrap = document.createElement('label'); routeWrap.id = 'booking-trip-rate-wrap'; routeWrap.innerHTML = 'Tarif par trajet<select id="booking-trip-rate"><option value="">Choisir un trajet</option></select><small class="field-note">Prix par jour, hors carburant, repas et hébergement du chauffeur.</small>'; anchor.before(routeWrap); $('booking-trip-rate')?.addEventListener('change', () => { updateClientDriverLabel(); if (typeof updateBookingQuote === 'function') updateBookingQuote(); }); } }
    const routeSelect = $('booking-trip-rate'); if (routeSelect) { const current = routeSelect.value; routeSelect.innerHTML = '<option value="">Choisir un trajet</option>' + (vehicle?.trip_rates || []).map(item => `<option value="${esc(item.id)}">${esc(item.from)} → ${esc(item.to)} — ${formatMGA(item.price_per_day)} / jour</option>`).join(''); routeSelect.value = current; }
    if (routeWrap) { routeWrap.style.display = mode === 'with_driver' ? '' : 'none'; const route = $('booking-trip-rate'); if (route && route.value) { const selected = (vehicle?.trip_rates || []).find(item => item.id === route.value); if (selected) { $('booking-trip-from').value = selected.from; $('booking-trip-to').value = selected.to; } } }
    if (typeof updateBookingQuote === 'function') updateBookingQuote();
  }
  function renderTripRates(rates = []) {
    const wrap = $('v-trip-rates'); if (!wrap) return;
    wrap.innerHTML = rates.map((rate, index) => `<div class="trip-rate-row" data-trip-index="${index}" style="display:grid;grid-template-columns:1fr 1fr 160px auto;gap:8px;margin:8px 0"><input data-trip-from placeholder="Départ" value="${esc(rate.from)}"><input data-trip-to placeholder="Destination" value="${esc(rate.to)}"><input data-trip-price type="number" min="0" placeholder="Prix / jour" value="${Number(rate.price_per_day || 0)}"><button type="button" class="btn danger" data-remove-trip>Supprimer</button></div>`).join('');
  }
  function collectTripRates() { return Array.from(document.querySelectorAll('#v-trip-rates .trip-rate-row')).map(row => ({id: row.dataset.tripId || `${Date.now()}-${Math.random().toString(36).slice(2,7)}`, from: row.querySelector('[data-trip-from]').value.trim(), to: row.querySelector('[data-trip-to]').value.trim(), price_per_day: Number(row.querySelector('[data-trip-price]').value || 0)})).filter(rate => rate.from && rate.to && rate.price_per_day > 0); }
  function photoControls() {
    const preview = $('v-photo-preview'); const urlBox = $('v-photo-url'); if (!preview || !urlBox) return;
    const urls = urlBox.value.split('\n').map(x => x.trim()).filter(Boolean);
    preview.innerHTML = urls.map((url, index) => `<span class="photo-thumb"><img src="${esc(url)}" alt="Photo véhicule" style="width:84px;height:58px;object-fit:cover;border-radius:7px;border:1px solid var(--line)"><button type="button" data-photo-index="${index}" aria-label="Supprimer cette photo">×</button></span>`).join('');
  }
  function startVehicleForm() {
    const form = $('vehicle-form'); if (!form) return;
    form.reset(); $('v-id').value = ''; $('v-driver-mode').value = 'without_driver'; $('v-driver-fee').value = 30000; $('v-extra-driver-fee').value = 30000; $('v-photo-url').value = ''; $('v-photo-file').value = ''; renderTripRates([]); photoControls(); form.classList.remove('hidden');
  }
  async function editVehicleForm(id) {
    const result = await window.rentCarSupabase.from('vehicles').select('*').eq('id', id).single(); const v = result.data; if (result.error || !v) return alert(result.error?.message || 'Véhicule introuvable.');
    $('v-id').value = v.id; $('v-name').value = v.name || ''; $('v-registration').value = v.registration_number || ''; $('v-make').value = v.make || ''; $('v-model').value = v.model || ''; $('v-driver-mode').value = v.driver_mode || 'without_driver'; $('v-price-12h').value = v.price_12h || v.price_per_day || 0; $('v-price-24h').value = v.price_24h || Number(v.price_per_day || 0) * 2; $('v-driver-fee').value = v.driver_fee ?? 30000; $('v-extra-driver-fee').value = v.extra_driver_fee ?? 30000; $('v-price').value = v.price_per_day || 0; $('v-transmission').value = v.transmission || ''; $('v-fuel').value = v.fuel || ''; $('v-seats').value = v.seats || ''; $('v-status').value = v.status || 'available'; $('v-description').value = v.description || ''; $('v-owner-name').value = v.owner_name || ''; $('v-owner-phone').value = v.owner_phone || ''; $('v-photo-url').value = (v.image_urls || []).join('\n'); $('v-photo-file').value = ''; renderTripRates(v.trip_rates || []); photoControls(); $('vehicle-form').classList.remove('hidden'); $('vehicle-form').scrollIntoView({behavior:'smooth'});
  }
  function installAdmin() {
    addRequiredStars(document);
    const urlBox = $('v-photo-url'); urlBox?.addEventListener('input', photoControls);
    $('add-trip-rate')?.addEventListener('click', () => { const rates = collectTripRates(); rates.push({from:'',to:'',price_per_day:0}); renderTripRates(rates); });
    $('v-trip-rates')?.addEventListener('click', e => { if (e.target.closest('[data-remove-trip]')) { e.target.closest('.trip-rate-row').remove(); } });
    $('v-photo-preview')?.addEventListener('click', async e => { const button = e.target.closest('[data-photo-index]'); if (!button) return; const urls = urlBox.value.split('\n').map(x => x.trim()).filter(Boolean); const removed = urls.splice(Number(button.dataset.photoIndex), 1)[0]; urlBox.value = urls.join('\n'); photoControls(); const marker = '/vehicle-images/'; const index = removed.indexOf(marker); if (index >= 0) await window.rentCarSupabase.storage.from('vehicle-images').remove([decodeURIComponent(removed.slice(index + marker.length).split('?')[0])]); });
    $('v-photo-file')?.addEventListener('change', () => { const files = Array.from($('v-photo-file').files || []); const note = $('v-photo-preview'); if (files.length) note.insertAdjacentHTML('beforeend', `<span class="photo-thumb"><span style="padding:18px 8px;border:1px dashed var(--line)">${files.length} nouvelle(s) photo(s)</span></span>`); });
    const form = $('vehicle-form');
    form?.addEventListener('submit', async event => {
      event.preventDefault(); event.stopImmediatePropagation();
      const id = $('v-id').value; const payload = {name:$('v-name').value.trim(),slug:$('v-name').value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'),registration_number:$('v-registration').value.trim(),make:$('v-make').value.trim(),model:$('v-model').value.trim(),driver_mode:$('v-driver-mode').value,driver_fee:Number($('v-driver-fee').value || 0),extra_driver_fee:Number($('v-extra-driver-fee').value || 0),trip_rates:collectTripRates(),price_12h:Number($('v-price-12h').value),price_24h:Number($('v-price-24h').value),price_per_day:Number($('v-price').value),transmission:$('v-transmission').value,fuel:$('v-fuel').value,seats:Number($('v-seats').value)||null,status:$('v-status').value,description:$('v-description').value,owner_name:$('v-owner-name').value.trim()||null,owner_phone:$('v-owner-phone').value.trim()||null};
      const response = id ? await window.rentCarSupabase.from('vehicles').update(payload).eq('id', id).select('id').single() : await window.rentCarSupabase.from('vehicles').insert(payload).select('id').single();
      if (response.error) return alert(response.error.message); const vehicleId = response.data.id;
      const files = Array.from($('v-photo-file').files || []); const urls = $('v-photo-url').value.split('\n').map(x => x.trim()).filter(Boolean);
      for (const file of files) { const safe = file.name.replace(/[^a-zA-Z0-9._-]/g,'-'); const path = `${vehicleId}/${Date.now()}-${safe}`; const upload = await window.rentCarSupabase.storage.from('vehicle-images').upload(path,file,{upsert:false,contentType:file.type}); if (!upload.error) urls.push(window.rentCarSupabase.storage.from('vehicle-images').getPublicUrl(path).data.publicUrl); }
      const imageUpdate = await window.rentCarSupabase.from('vehicles').update({image_urls:urls}).eq('id', vehicleId); if (imageUpdate.error) alert(imageUpdate.error.message);
      form.reset(); $('v-id').value=''; form.classList.add('hidden'); if (typeof refreshAll === 'function') await refreshAll();
    }, true);
    const vehicleObserver = new MutationObserver(photoControls); if ($('v-photo-preview')) vehicleObserver.observe($('v-photo-preview'), {childList:true});
  }
  document.addEventListener('DOMContentLoaded', () => { addRequiredStars(document); updateClientDriverLabel(); $('booking-vehicle')?.addEventListener('change', updateClientDriverLabel); installAdmin(); window.startAddVehicle = startVehicleForm; window.editVehicle = editVehicleForm; });
  window.updateClientDriverLabel = updateClientDriverLabel;
})();
