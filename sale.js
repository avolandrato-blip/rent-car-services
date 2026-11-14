(() => {
  const db=window.rentCarSupabase, target=document.getElementById('sale-catalog');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v?`${Number(v).toLocaleString('fr-FR')} Ar`:'Prix à définir';
  const docs=(s)=>['Carte grise','Assurance','Visite technique','Carte rose','Modèle n°1'].map((label,i)=>{const key=['registration_card_status','insurance_status','inspection_status','pink_card_status','model_1_status'][i];return `<span class="sale-doc ${s[key]==='yes'?'ok':''}">${label}: ${s[key]==='yes'?'Oui':s[key]==='no'?'Non':'À vérifier'}</span>`}).join('');
  async function load(){
    if(!target)return;
    if(!db){target.innerHTML='<p class="empty">Le catalogue ventes est momentanément indisponible.</p>';return;}
    const {data,error}=await db.from('vehicle_sales').select('*').eq('status','accepted').order('created_at',{ascending:false}).limit(50);
    if(error){console.error('vehicle_sales public read failed:',error);target.innerHTML='<p class="empty">Les annonces sont momentanément indisponibles. Veuillez réessayer dans quelques instants.</p>';return;}
    const rows=Array.isArray(data)?data:[];
    target.innerHTML=rows.map(s=>{const photos=Object.values(s.photo_urls||{}).filter(Boolean), title=`${s.make||''} ${s.model||''}`.trim(), whatsapp=`https://wa.me/261349120726?text=${encodeURIComponent(`Bonjour Rent Car Service, je suis intéressé(e) par la ${title}${s.asking_price?` au prix de ${Number(s.asking_price).toLocaleString('fr-FR')} Ar`:''}. Pouvez-vous me donner plus d’informations ?`)}`;return `<article class="sale-card"><div class="sale-card-gallery${photos.length===1?' single-image':''}">${photos.length?photos.map(url=>`<img src="${esc(url)}" alt="${esc(title)}">`).join(''):'<div class="sale-no-photo"><i class="fas fa-car"></i></div>'}</div><div class="sale-card-body"><h3>${esc(title)}${s.year?` · ${s.year}`:''}</h3><strong class="sale-price">${money(s.asking_price)}</strong><p>${esc(s.description||'Description disponible sur demande.')}</p><div class="sale-specs"><span>${s.mileage_km?Number(s.mileage_km).toLocaleString('fr-FR')+' km':'Kilométrage à vérifier'}</span><span>${esc(s.transmission||'Transmission à vérifier')}</span><span>${esc(s.fuel||'Carburant à vérifier')}</span><span>${s.seats?`${s.seats} places`:''}</span></div><div class="sale-docs">${docs(s)}</div><a class="btn btn-whatsapp" href="${esc(whatsapp)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp"></i> Nous contacter sur WhatsApp</a></div></article>`;}).join('')||'<p class="empty">Aucune voiture à vendre pour le moment.</p>';
  }
  document.addEventListener('DOMContentLoaded',load);
})();
