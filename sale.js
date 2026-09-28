(() => {
  const db = window.rentCarSupabase;
  const $ = id => document.getElementById(id);
  const photoFiles = {};
  const photoLabels = {front:'Face avant',rear:'Arrière',left:'Côté gauche',right:'Côté droit',interior_front:'Intérieur avant',interior_rear:'Intérieur arrière'};
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val = id => $(id)?.value.trim() || null;
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-sale-photo]').forEach(input => input.addEventListener('change', () => {
      const key=input.dataset.salePhoto, file=input.files?.[0]; if (file) photoFiles[key]=file;
      const preview=$('sale-photo-previews'); preview.innerHTML=Object.entries(photoFiles).map(([name,item])=>`<span class="sale-photo-preview"><img src="${URL.createObjectURL(item)}" alt="${esc(photoLabels[name])}"><small>${esc(photoLabels[name])}</small></span>`).join('');
    }));
    $('sale-form').addEventListener('submit', async event => {
      event.preventDefault(); const button=event.target.querySelector('button[type="submit"]'); const result=$('sale-result'); button.disabled=true; button.textContent='Envoi en cours…'; result.textContent='';
      try {
        const payload={seller_name:val('sale-seller-name'),seller_phone:val('sale-seller-phone'),seller_email:val('sale-seller-email'),seller_address:val('sale-seller-address'),make:val('sale-make'),model:val('sale-model'),year:Number(val('sale-year'))||null,asking_price:Number(val('sale-price'))||null,mileage_km:Number(val('sale-mileage'))||null,description:val('sale-description'),repairs_needed:val('sale-repairs'),transmission:val('sale-transmission'),fuel:val('sale-fuel'),seats:Number(val('sale-seats'))||null,registration_card_status:val('sale-registration'),insurance_status:val('sale-insurance'),inspection_status:val('sale-inspection'),pink_card_status:val('sale-pink-card'),model_1_status:val('sale-model-1'),notes:val('sale-notes'),photo_urls:{}};
        const inserted=await db.from('vehicle_sales').insert(payload).select('id').single(); if(inserted.error) throw new Error(inserted.error.message);
        const urls={}; for (const [key,file] of Object.entries(photoFiles)) { if(file.size>8*1024*1024) throw new Error(`La photo « ${photoLabels[key]} » dépasse 8 Mo.`); const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-'); const path=`${inserted.data.id}/${key}-${Date.now()}-${safe}`; const upload=await db.storage.from('vehicle-sales').upload(path,file,{upsert:false,contentType:file.type}); if(upload.error) throw new Error(`Photo ${photoLabels[key]} : ${upload.error.message}`); urls[key]=db.storage.from('vehicle-sales').getPublicUrl(path).data.publicUrl; }
        if(Object.keys(urls).length) { const updated=await db.from('vehicle_sales').update({photo_urls:urls}).eq('id',inserted.data.id); if(updated.error) throw new Error(updated.error.message); }
        event.target.reset(); Object.keys(photoFiles).forEach(k=>delete photoFiles[k]); $('sale-photo-previews').innerHTML=''; result.textContent='Votre demande a bien été envoyée. Nous vous contacterons après étude du véhicule.'; result.className='booking-result success';
      } catch(error) { result.textContent=`Envoi impossible : ${error.message}`; result.className='booking-result error'; }
      finally { button.disabled=false; button.innerHTML='<i class="fas fa-paper-plane"></i> Envoyer la voiture à vendre'; }
    });
  });
})();
