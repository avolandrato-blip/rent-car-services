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
    form.reset(); $('v-id').value = ''; if ($('v-driver-mode')) $('v-driver-mode').value = 'without_driver'; if ($('v-driver-fee')) $('v-driver-fee').value = 30000; if ($('v-extra-driver-fee')) $('v-extra-driver-fee').value = 30000; if ($('v-photo-url')) $('v-photo-url').value = ''; if ($('v-photo-file')) $('v-photo-file').value = ''; renderTripRates([]); photoControls(); form.classList.remove('hidden');
  }
  async function editVehicleForm(id) {
    const result = await window.rentCarSupabase.from('vehicles').select('*').eq('id', id).single(); const v = result.data; if (result.error || !v) return alert(result.error?.message || 'Véhicule introuvable.');
    $('v-id').value = v.id; $('v-name').value = v.name || ''; $('v-registration').value = v.registration_number || ''; $('v-make').value = v.make || ''; $('v-model').value = v.model || ''; if ($('v-driver-mode')) $('v-driver-mode').value = v.driver_mode || 'without_driver'; $('v-price-12h').value = v.price_12h || v.price_per_day || 0; $('v-price-24h').value = v.price_24h || Number(v.price_per_day || 0) * 2; if ($('v-driver-fee')) $('v-driver-fee').value = v.driver_fee ?? 30000; if ($('v-extra-driver-fee')) $('v-extra-driver-fee').value = v.extra_driver_fee ?? 30000; $('v-price').value = v.price_per_day || 0; $('v-transmission').value = v.transmission || ''; $('v-fuel').value = v.fuel || ''; $('v-seats').value = v.seats || ''; $('v-status').value = v.status || 'available'; $('v-description').value = v.description || ''; $('v-owner-name').value = v.owner_name || ''; $('v-owner-phone').value = v.owner_phone || ''; if ($('v-photo-url')) $('v-photo-url').value = (v.image_urls || []).join('\n'); if ($('v-photo-file')) $('v-photo-file').value = ''; renderTripRates(v.trip_rates || []); photoControls(); $('vehicle-form').classList.remove('hidden'); $('vehicle-form').scrollIntoView({behavior:'smooth'});
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
      const id = $('v-id').value; const payload = {name:$('v-name').value.trim(),slug:$('v-name').value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-'),registration_number:$('v-registration').value.trim(),make:$('v-make').value.trim(),model:$('v-model').value.trim(),trip_rates:collectTripRates(),price_12h:Number($('v-price-12h').value),price_24h:Number($('v-price-24h').value),price_per_day:Number($('v-price').value),transmission:$('v-transmission').value,fuel:$('v-fuel').value,seats:Number($('v-seats').value)||null,status:$('v-status').value,description:$('v-description').value,owner_name:$('v-owner-name').value.trim()||null,owner_phone:$('v-owner-phone').value.trim()||null};
      const response = id ? await window.rentCarSupabase.from('vehicles').update(payload).eq('id', id).select('id').single() : await window.rentCarSupabase.from('vehicles').insert(payload).select('id').single();
      if (response.error) return alert(response.error.message); const vehicleId = response.data.id;
      const files = Array.from($('v-photo-file').files || []); const urls = $('v-photo-url').value.split('\n').map(x => x.trim()).filter(Boolean);
      for (const file of files) { const safe = file.name.replace(/[^a-zA-Z0-9._-]/g,'-'); const path = `${vehicleId}/${Date.now()}-${safe}`; const upload = await window.rentCarSupabase.storage.from('vehicle-images').upload(path,file,{upsert:false,contentType:file.type}); if (!upload.error) urls.push(window.rentCarSupabase.storage.from('vehicle-images').getPublicUrl(path).data.publicUrl); }
      const imageUpdate = await window.rentCarSupabase.from('vehicles').update({image_urls:urls}).eq('id', vehicleId); if (imageUpdate.error) alert(imageUpdate.error.message);
      form.reset(); $('v-id').value=''; form.classList.add('hidden'); if (typeof refreshAll === 'function') await refreshAll();
    }, true);
    const vehicleObserver = new MutationObserver(photoControls); if ($('v-photo-preview')) vehicleObserver.observe($('v-photo-preview'), {childList:true});
  }
  document.addEventListener('DOMContentLoaded', () => {
    addRequiredStars(document); updateClientDriverLabel(); $('booking-vehicle')?.addEventListener('change', updateClientDriverLabel); installAdmin();
    window.startAddVehicle = startVehicleForm;
    window.editVehicle = async id => { try { await editVehicleForm(id); } catch (error) { console.error('Erreur modification véhicule', error); alert(`Impossible d’ouvrir le véhicule : ${error.message}`); } };
    const coreToggleVehicleStatus = window.toggleVehicleStatus;
    if (typeof coreToggleVehicleStatus === 'function') window.toggleVehicleStatus = async id => { try { await coreToggleVehicleStatus(id); } catch (error) { console.error('Erreur statut véhicule', error); alert(`Impossible de modifier le statut : ${error.message}`); } };
  });
  window.updateClientDriverLabel = updateClientDriverLabel;
})();
