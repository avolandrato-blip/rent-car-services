(() => {
  const $ = id => document.getElementById(id);
  const db = window.rentCarSupabase;
  const PHOTO_BUCKET = 'vehicle-images';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => window.formatMGA ? window.formatMGA(value) : `${Number(value || 0).toLocaleString('fr-FR')} Ar`;
  const permitLabels = {A:'Moto (A)', B:'Voiture (B)', C:'Poids lourd (C)'};
  const availabilityLabels = {available:'Disponible', by_booking:'Sur réservation', unavailable:'Indisponible'};
  const rateIds = ['city-daily','city-24h','province-daily','delivery','recovery'];
  let selectedPhoto = null;
  let currentPhotoUrl = null;

  function photoPreview(file) {
    const preview = $('driver-photo-preview');
    if (!preview) return;
    if (file) {
      preview.src = typeof file === 'string' ? file : URL.createObjectURL(file);
      preview.classList.remove('hidden');
      if (typeof file !== 'string') preview.onload = () => URL.revokeObjectURL(preview.src);
    } else {
      preview.removeAttribute('src');
      preview.classList.add('hidden');
    }
  }

  function formPayload(photoUrl) {
    const rates = Object.fromEntries(rateIds.map(key => [key, Number($(`driver-${key}`)?.value || 0)]));
    if (Object.values(rates).some(value => value < 20000 || value > 50000)) throw new Error('Les tarifs chauffeur doivent être compris entre 20 000 et 50 000 Ar.');
    return {name:$('driver-name').value.trim(), photo_url:photoUrl || null, phone:$('driver-phone').value.trim() || null, whatsapp:$('driver-whatsapp').value.trim() || null, permits:['A','B','C'].filter(code => $(`driver-permit-${code}`)?.checked), city_daily_rate:rates['city-daily'], city_24h_rate:rates['city-24h'], province_daily_rate:rates['province-daily'], delivery_rate:rates.delivery, recovery_rate:rates.recovery, lodging_included:$('driver-lodging').value === 'included', meals_included:$('driver-meals').value === 'included', availability:$('driver-availability').value, description:$('driver-description').value.trim() || null, languages:$('driver-languages').value.trim() || null, experience_years:Number($('driver-experience').value || 0) || null, active:true};
  }

  async function uploadDriverPhoto(driverId, file) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) throw new Error('Veuillez sélectionner une image.');
    if (file.size > 8 * 1024 * 1024) throw new Error('La photo doit faire 8 Mo maximum.');
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `chauffeurs/${driverId}/${Date.now()}.${extension}`;
    const upload = await db.storage.from(PHOTO_BUCKET).upload(path, file, {upsert:false, contentType:file.type});
    if (upload.error) throw new Error(`Téléversement de la photo impossible : ${upload.error.message}`);
    return db.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function resetForm() {
    $('driver-form')?.reset(); $('driver-id').value=''; selectedPhoto=null; currentPhotoUrl=null; photoPreview(null);
    $('driver-city-daily').value=30000; $('driver-city-24h').value=40000; $('driver-province-daily').value=50000; $('driver-delivery').value=20000; $('driver-recovery').value=20000;
    $('driver-form').classList.remove('hidden');
  }

  async function loadDrivers() { const {data,error}=await db.from('chauffeurs').select('*').order('created_at',{ascending:false}); if (error) { $('drivers-table').innerHTML=`<div class="notice">Impossible de charger les chauffeurs : ${esc(error.message)}</div>`; return []; } renderDrivers(data || []); return data || []; }
  function renderDrivers(rows) { $('drivers-table').innerHTML = rows.map(d => `<div class="card driver-admin-card"><div class="section-head"><div class="driver-admin-identity">${d.photo_url?`<img src="${esc(d.photo_url)}" alt="${esc(d.name)}">`:''}<span><strong>${esc(d.name)}</strong><br><small>${esc((d.permits||[]).map(p => permitLabels[p] || p).join(' · ') || 'Permis non renseigné')} · ${esc(availabilityLabels[d.availability] || d.availability)}</small></span></div><div class="actions"><button class="btn outline" onclick="window.editDriver('${d.id}')">Modifier</button><button class="btn ${d.active ? 'danger':'primary'}" onclick="window.toggleDriver('${d.id}',${!d.active})">${d.active?'Désactiver':'Activer'}</button></div></div><div class="driver-admin-rates">Ville : ${money(d.city_daily_rate)} / jour · Ville 24 h : ${money(d.city_24h_rate)} · Province : ${money(d.province_daily_rate)} / jour · Livraison : ${money(d.delivery_rate)} · Récupération : ${money(d.recovery_rate)}<br>Hébergement : ${d.lodging_included?'inclus':'non inclus'} · Repas : ${d.meals_included?'inclus':'non inclus'}</div></div>`).join('') || '<div class="empty">Aucun chauffeur enregistré.</div>'; }

  async function editDriver(id) { const {data,error}=await db.from('chauffeurs').select('*').eq('id',id).single(); if(error || !data) return alert(error?.message || 'Chauffeur introuvable.'); $('driver-id').value=data.id; $('driver-name').value=data.name||''; selectedPhoto=null; currentPhotoUrl=data.photo_url||null; photoPreview(currentPhotoUrl); $('driver-phone').value=data.phone||''; $('driver-whatsapp').value=data.whatsapp||''; ['A','B','C'].forEach(p => $(`driver-permit-${p}`).checked=(data.permits||[]).includes(p)); $('driver-city-daily').value=data.city_daily_rate; $('driver-city-24h').value=data.city_24h_rate; $('driver-province-daily').value=data.province_daily_rate; $('driver-delivery').value=data.delivery_rate; $('driver-recovery').value=data.recovery_rate; $('driver-lodging').value=data.lodging_included?'included':'not_included'; $('driver-meals').value=data.meals_included?'included':'not_included'; $('driver-availability').value=data.availability||'available'; $('driver-description').value=data.description||''; $('driver-languages').value=data.languages||''; $('driver-experience').value=data.experience_years||''; $('driver-form').classList.remove('hidden'); $('driver-form').scrollIntoView({behavior:'smooth'}); }
  async function toggleDriver(id,active) { const {error}=await db.from('chauffeurs').update({active}).eq('id',id); if(error) alert(error.message); else loadDrivers(); }

  function renderPublicDrivers(rows) { const target=$('drivers-grid'); if(!target)return; target.innerHTML=rows.map(d=>`<article class="driver-card">${d.photo_url?`<img src="${esc(d.photo_url)}" alt="Photo de ${esc(d.name)}" loading="lazy">`: '<div class="driver-photo-placeholder"><i class="fas fa-user-tie"></i></div>'}<div class="driver-card-body"><h3>${esc(d.name)}</h3><p>${esc(availabilityLabels[d.availability]||'Sur réservation')} · Permis ${esc((d.permits||[]).join(', ')||'—')}</p>${d.description?`<p>${esc(d.description)}</p>`:''}<dl><div><dt>Ville</dt><dd>${money(d.city_daily_rate)} / jour</dd></div><div><dt>Ville 24 h</dt><dd>${money(d.city_24h_rate)}</dd></div><div><dt>Province</dt><dd>${money(d.province_daily_rate)} / jour</dd></div><div><dt>Livraison</dt><dd>${money(d.delivery_rate)}</dd></div><div><dt>Récupération</dt><dd>${money(d.recovery_rate)}</dd></div></dl><p class="driver-conditions">Hébergement : <strong>${d.lodging_included?'inclus':'non inclus'}</strong> · Repas : <strong>${d.meals_included?'inclus':'non inclus'}</strong></p><div class="car-actions">${d.whatsapp?`<a class="btn btn-whatsapp" target="_blank" rel="noopener" href="https://wa.me/${encodeURIComponent(String(d.whatsapp).replace(/\D/g,''))}">WhatsApp</a>`:''}${d.phone?`<a class="btn btn-outline" href="tel:${encodeURIComponent(d.phone)}">Appeler</a>`:''}</div></div></article>`).join('') || '<p class="fleet-empty">Aucun chauffeur disponible pour le moment.</p>'; }

  document.addEventListener('DOMContentLoaded', async () => {
    const form=$('driver-form');
    if(form) {
      $('driver-add')?.addEventListener('click',resetForm);
      $('driver-photo-file')?.addEventListener('change', e => { selectedPhoto=e.target.files?.[0] || null; photoPreview(selectedPhoto); });
      form.addEventListener('submit',async e=>{
        e.preventDefault(); const button=form.querySelector('button[type="submit"]'); if(button) {button.disabled=true; button.textContent='Enregistrement...';}
        try {
          const id=$('driver-id').value;
          let result;
          if (id) result=await db.from('chauffeurs').update(formPayload(currentPhotoUrl)).eq('id',id).select('id').single();
          else result=await db.from('chauffeurs').insert(formPayload(null)).select('id').single();
          if(result.error) throw new Error(result.error.message);
          const driverId=id || result.data.id;
          if (selectedPhoto) { const photoUrl=await uploadDriverPhoto(driverId, selectedPhoto); const update=await db.from('chauffeurs').update({photo_url:photoUrl}).eq('id',driverId); if(update.error) throw new Error(update.error.message); }
          form.classList.add('hidden'); selectedPhoto=null; currentPhotoUrl=null; photoPreview(null); await loadDrivers();
        } catch(error) { alert(error.message || 'Enregistrement impossible.'); }
        finally { if(button) {button.disabled=false; button.textContent='Enregistrer le chauffeur';} }
      });
      await loadDrivers();
    }
    if($('drivers-grid')) { const {data}=await db.from('chauffeurs').select('*').eq('active',true).neq('availability','unavailable').order('name'); renderPublicDrivers(data||[]); }
  });
  window.editDriver=editDriver; window.toggleDriver=toggleDriver;
})();
