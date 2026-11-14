(() => {
  const db = window.rentCarSupabase;
  const target = document.getElementById('sale-catalog');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
  const money = value => value ? `${Number(value).toLocaleString('fr-FR')} Ar` : 'Prix à définir';
  const docStatuses = ['registration_card_status', 'insurance_status', 'inspection_status', 'pink_card_status', 'model_1_status'];
  const docLabels = ['Carte grise', 'Assurance', 'Visite technique', 'Carte rose', 'Modèle n°1'];
  const docs = sale => docLabels.map((label, index) => {
    const status = sale[docStatuses[index]];
    return `<span class="sale-doc ${status === 'yes' ? 'ok' : ''}">${label}: ${status === 'yes' ? 'Oui' : status === 'no' ? 'Non' : 'À vérifier'}</span>`;
  }).join('');

  async function load() {
    if (!target) return;
    if (!db) {
      target.innerHTML = '<p class="empty">Le catalogue ventes est momentanément indisponible.</p>';
      return;
    }
    const { data, error } = await db.from('vehicle_sales').select('*')
      .eq('status', 'accepted').order('created_at', { ascending: false }).limit(50);
    if (error) {
      console.error('vehicle_sales public read failed:', error);
      target.innerHTML = '<p class="empty">Les annonces sont momentanément indisponibles. Veuillez réessayer dans quelques instants.</p>';
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    target.innerHTML = rows.map(sale => {
      const photos = Object.values(sale.photo_urls || {}).filter(Boolean);
      const title = `${sale.make || ''} ${sale.model || ''}`.trim();
      const amount = sale.asking_price ? ` au prix de ${Number(sale.asking_price).toLocaleString('fr-FR')} Ar` : '';
      const message = `Bonjour Rent Car Service, je souhaite en savoir plus sur le véhicule ${title}${amount}. Merci de rester mon interlocuteur et de centraliser toutes les questions et demandes de visite, sans communiquer directement mes coordonnées au vendeur.`;
      const whatsapp = `https://wa.me/261349120726?text=${encodeURIComponent(message)}`;
      return `<article class="sale-card"><div class="sale-card-gallery${photos.length === 1 ? ' single-image' : ''}">${photos.length ? photos.map(url => `<img src="${esc(url)}" alt="${esc(title)}">`).join('') : '<div class="sale-no-photo"><i class="fas fa-car"></i></div>'}</div><div class="sale-card-body"><h3>${esc(title)}${sale.year ? ` · ${sale.year}` : ''}</h3><strong class="sale-price">${money(sale.asking_price)}</strong><p>${esc(sale.description || 'Description disponible sur demande.')}</p><div class="sale-specs"><span>${sale.mileage_km ? `${Number(sale.mileage_km).toLocaleString('fr-FR')} km` : 'Kilométrage à vérifier'}</span><span>${esc(sale.transmission || 'Transmission à vérifier')}</span><span>${esc(sale.fuel || 'Carburant à vérifier')}</span><span>${sale.seats ? `${sale.seats} places` : ''}</span></div><div class="sale-docs">${docs(sale)}</div><a class="btn btn-whatsapp" href="${esc(whatsapp)}" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp"></i> Demander des informations via Rent Car Service</a></div></article>`;
    }).join('') || '<p class="empty">Aucune voiture à vendre pour le moment.</p>';
  }

  document.addEventListener('DOMContentLoaded', load);
})();
