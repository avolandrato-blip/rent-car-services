let siteConfig = {};

document.addEventListener('DOMContentLoaded', async () => {
    await initSite();
});

async function initSite() {
    try {
        const resConfig = await fetch('config.json');
        siteConfig = await resConfig.json();

        // 1. Thème et Fond Global (Correction forcée pour soarano.png)
        document.documentElement.style.setProperty('--primary', siteConfig.theme.primary);
        document.documentElement.style.setProperty('--accent', siteConfig.theme.accent);
        
        if (siteConfig.theme.site_bg) {
            // Application du fond sur l'élément racine pour garantir la visibilité
            document.documentElement.style.backgroundImage = `url('${siteConfig.theme.site_bg}')`;
            document.documentElement.style.backgroundAttachment = "fixed";
            document.documentElement.style.backgroundSize = "cover";
            document.documentElement.style.backgroundPosition = "center";
            // On rend le body transparent pour ne pas masquer le fond du html
            document.body.style.backgroundColor = "transparent";
        }

        // 2. Header (Logo + Nom + Suffixe)
        document.getElementById('brand-name').innerHTML = `
            <img src="${siteConfig.header.logo_url}" alt="Logo" style="height: 40px; vertical-align: middle; margin-right: 10px;">
            ${siteConfig.header.nom} <span>${siteConfig.header.suffixe}</span>
        `;

        // 3. Footer (Infos, Téléphone, NIF/STAT)
        const legalInfo = (siteConfig.footer.nif || siteConfig.footer.stat)
            ? `<p style="font-size:0.8rem; margin-top:5px; color:#777;">NIF: ${siteConfig.footer.nif || '—'} | STAT: ${siteConfig.footer.stat || '—'}</p>`
            : '';
        document.getElementById('footer-info').innerHTML = `
            <p><b>${siteConfig.header.nom}</b><br>${siteConfig.footer.adresse}</p>
            <p style="margin-top:5px;">
                <i class="fas fa-phone"></i> ${siteConfig.footer.telephone}
            </p>
            ${legalInfo}
        `;

        // 4. Réseaux Sociaux (incluant le bouton Google Maps)
        const socialIcons = {
            facebook: 'fab fa-facebook',
            tiktok: 'fab fa-tiktok',
            instagram: 'fab fa-instagram',
            maps: 'fas fa-map-marker-alt'
        };
        document.getElementById('social-links').innerHTML = Object.entries(siteConfig.social_links)
            .filter(([_, url]) => url)
            .map(([name, url]) => `<a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="${name}"><i class="${socialIcons[name]}"></i></a>`)
            .join('');

        // 5. Liens d'action directs (Bouton d'appel et WhatsApp)
        const fabCall = document.getElementById('fab-call');
        if(fabCall) fabCall.href = `tel:${siteConfig.footer.telephone.replace(/\s/g, '')}`;
        
        const heroWhatsapp = document.getElementById('hero-whatsapp');
        if(heroWhatsapp) heroWhatsapp.href = `https://wa.me/${siteConfig.footer.whatsapp}`;

        // 6. Chargement des modules de données
        await loadHome();
        await loadCards();
        await loadCars();
        await loadFun();
        await loadContact();
        await loadBookingData();

    } catch (e) { 
        console.error("Erreur lors de l'initialisation du site:", e); 
    }
}

async function loadHome() {
    const res = await fetch('home.json');
    const data = await res.json();
    const banner = document.getElementById('hero-banner');
    if(banner) banner.style.backgroundImage = `url('${data.hero.image}')`;
    
    document.getElementById('hero-title').innerText = data.hero.titre;
    document.getElementById('hero-slogan').innerText = data.hero.slogan;
    document.getElementById('hero-desc').innerText = data.hero.description;
}

// Gestion des Cartes Tournantes (Flip Cards)
async function loadCards() {
    const res = await fetch('data_cards.json');
    const data = await res.json();
    
    // Grille "Pourquoi nous choisir" avec effet rotation
    document.getElementById('features-grid').innerHTML = data.features.map(f => `
        <div class="flip-card" onclick="this.classList.toggle('flipped')">
            <div class="flip-card-inner">
                <div class="flip-front">
                    <i class="fas ${f.icon}"></i>
                    <h3>${f.titre}</h3>
                </div>
                <div class="flip-back">
                    <p>${f.description}</p>
                </div>
            </div>
        </div>
    `).join('');

    // Grille "Conditions" avec effet rotation
    document.getElementById('conditions-grid').innerHTML = data.conditions.map(c => `
        <div class="flip-card" onclick="this.classList.toggle('flipped')">
            <div class="flip-card-inner">
                <div class="flip-front">
                    <i class="fas ${c.icon}"></i>
                    <h4>${c.titre}</h4>
                </div>
                <div class="flip-back">
                    <p>${c.reponse}</p>
                </div>
            </div>
        </div>
    `).join('');
}

// Galerie des véhicules
async function loadCars() {
    const localResponse = await fetch('cars.json', { cache: 'no-store' });
    const localData = await localResponse.json();
    const localCars = localData.liste || [];
    let cars = localCars;
    if (window.rentCarSupabase) {
        const { data: remoteCars, error } = await window.rentCarSupabase.from('vehicles').select('*').neq('status', 'inactive').order('name');
        if (!error && remoteCars?.length) {
            cars = remoteCars.map(car => {
                const local = localCars.find(item => item.nom === car.name || item.slug === car.slug) || {};
                return {
                    ...car,
                    nom: car.name,
                    prix: `${formatMGA(car.price_per_day)} / jour`,
                    transmission: car.transmission || local.transmission || '—',
                    carburant: car.fuel || local.carburant || '—',
                    places: car.seats || local.places || '—',
                    description: car.description || local.description || '',
                    photos: (car.image_urls && car.image_urls.length) ? car.image_urls : (local.photos || [])
                };
            });
        }
    }
    document.getElementById('cars-grid').innerHTML = cars.map(car => `
        <div class="car-card">
            <div class="car-gallery">
                ${(car.photos || []).map(photo => `<img src="${photo}" loading="lazy" alt="${car.nom}">`).join('')}
            </div>
            <div class="car-info">
                <h3>${car.nom}</h3>
                <p class="car-price">${car.prix}</p>
                <div class="car-tags">
                    <span><i class="fas fa-cog"></i> ${car.transmission}</span>
                    <span><i class="fas fa-gas-pump"></i> ${car.carburant}</span>
                    <span><i class="fas fa-users"></i> ${car.places}</span>
                </div>
                <p class="car-desc">${car.description}</p>
                <div class="car-actions">
                    <button class="btn btn-primary btn-reserve" onclick="openBookingForVehicle('${car.id || ''}','${car.nom}')">Réserver</button>
                    <button class="btn btn-outline" onclick="openLongTermQuote('${car.nom}')">Contactez-nous</button>
                    <a href="https://wa.me/${siteConfig.footer.whatsapp}" target="_blank" class="btn btn-whatsapp btn-icon" aria-label="WhatsApp ${car.nom}"><i class="fab fa-whatsapp"></i></a>
                    <a href="tel:${siteConfig.footer.telephone.replace(/\s/g,'')}" class="btn btn-primary btn-icon" aria-label="Appeler ${car.nom}"><i class="fas fa-phone"></i></a>
                </div>
            </div>
        </div>
    `).join('');
}

// Musique et Divertissement
async function loadFun() {
    const res = await fetch('fun.json');
    const data = await res.json();
    
    let contentHtml = '';
    contentHtml += data.radios.map(r => `
        <div class="radio-card">
            <h4>${r.nom}</h4>
            <div class="radio-logo-container">
                <img src="${r.logo}" alt="${r.nom}">
            </div>
            <audio class="audio-player" controls src="${r.url}"></audio>
        </div>
    `).join('');

    if(data.playlists) {
        contentHtml += data.playlists.map(p => `
             <div class="radio-card">
                <h4>${p.nom}</h4>
                <div class="radio-logo-container">
                    <img src="${p.logo}" alt="${p.nom}">
                </div>
                <a href="${p.link}" target="_blank" class="btn btn-primary" style="width:100%; justify-content:center; text-decoration:none;">
                    <i class="fas fa-play"></i> Écouter
                </a>
            </div>
        `).join('');
    }
    document.getElementById('radios-grid').innerHTML = contentHtml;
}

// Formulaire de contact dynamique
async function loadContact() {
    const res = await fetch('contact.json');
    const data = await res.json();
    const form = document.getElementById('dynamic-form');
    
    form.innerHTML = data.formulaire.map(f => {
        let inputHtml = '';
        if(f.type === 'select') {
            inputHtml = `<select id="${f.id}">${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select>`;
        } else if(f.type === 'textarea') {
            inputHtml = `<textarea id="${f.id}" rows="4" placeholder="${f.placeholder}"></textarea>`;
        } else {
            inputHtml = `<input type="${f.type}" id="${f.id}" placeholder="${f.placeholder}">`;
        }
        return `<div class="form-group"><label>${f.label}</label>${inputHtml}</div>`;
    }).join('') + `<button type="submit" class="btn btn-whatsapp btn-submit">Envoyer sur WhatsApp <i class="fab fa-whatsapp"></i></button>`;
}

// Fonctions utilitaires (Onglets, Menu, Prefill)
function openTab(id) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.getElementById('nav-menu').classList.remove('active');
    window.scrollTo(0,0);
}

function toggleMenu() {
    document.getElementById('nav-menu').classList.toggle('active');
}

function prefill(car) {
    openTab('contact');
    setTimeout(() => {
        const msgField = document.getElementById('message');
        if(msgField) {
            msgField.value = `Bonjour, je suis intéressé par la location de la ${car}.`;
            msgField.scrollIntoView();
        }
    }, 300);
}

function openBookingForVehicle(vehicleId, vehicleName) {
    openTab('booking');
    const select = document.getElementById('booking-vehicle');
    if (select && vehicleId && [...select.options].some(option => option.value === vehicleId)) select.value = vehicleId;
    updateBookingQuote();
    document.getElementById('booking-form')?.scrollIntoView({ behavior: 'smooth' });
}

function openLongTermQuote(vehicleName) {
    openTab('contact');
    setTimeout(() => {
        const message = document.getElementById('message');
        if (message) message.value = `Bonjour, je souhaite demander un devis pour une location longue durée${vehicleName ? ` de la ${vehicleName}` : ''}.`;
        document.getElementById('dynamic-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 300);
}

function sendWhatsApp(e) {
    e.preventDefault();
    const inputs = document.querySelectorAll('#dynamic-form input, #dynamic-form select, #dynamic-form textarea');
    let msg = "Bonjour, voici ma demande :%0A%0A";
    inputs.forEach(input => {
        const label = input.previousElementSibling ? input.previousElementSibling.innerText : "Champ";
        if(input.value) msg += `*${label}*: ${input.value}%0A`;
    });
    window.open(`https://wa.me/${siteConfig.footer.whatsapp}?text=${msg}`, '_blank');
}

let bookingVehicles = [];
let bookingReservations = [];
let bookingMaintenance = [];

async function loadBookingData() {
    if (!window.rentCarSupabase) return;
    const db = window.rentCarSupabase;
    const [{ data: vehicles, error: vehicleError }, { data: reservations }, { data: maintenance }] = await Promise.all([
        db.from('vehicles').select('*').eq('status', 'available').order('name'),
        db.from('reservations').select('vehicle_id,start_at,end_at,status').eq('status', 'reserved'),
        db.from('maintenance').select('vehicle_id,start_at,end_at')
    ]);
    if (vehicleError) {
        console.warn('Supabase booking data unavailable:', vehicleError.message);
        return;
    }
    bookingVehicles = vehicles || [];
    bookingReservations = reservations || [];
    bookingMaintenance = maintenance || [];
    const select = document.getElementById('booking-vehicle');
    if (select) select.innerHTML = bookingVehicles.map(v => `<option value="${v.id}">${v.name} — ${formatMGA(v.price_per_day)}/jour</option>`).join('');
    const availabilityVehicle = document.getElementById('availability-vehicle');
    if (availabilityVehicle) availabilityVehicle.innerHTML = `<option value="all">Toutes les voitures</option>${bookingVehicles.map(v => `<option value="${v.id}">${v.name}</option>`).join('')}`;
}

function overlaps(start, end, item) {
    return new Date(item.start_at) < new Date(end) && new Date(item.end_at) > new Date(start);
}

function getVehicleAvailability(vehicleId, start, end) {
    if (!start || !end) return 'unknown';
    if (bookingMaintenance.some(item => item.vehicle_id === vehicleId && overlaps(start, end, item))) return 'maintenance';
    const reservation = bookingReservations.find(item => item.vehicle_id === vehicleId && overlaps(start, end, item));
    return reservation ? reservation.status : 'available';
}

function availabilityLabel(status) {
    return { available: 'Disponible', pre_reserved: 'Pré-réservée', reserved: 'Réservée', maintenance: 'En maintenance', unknown: 'Dates à choisir' }[status] || status;
}

function calculateBookingQuote(vehicle, start, end, rentalType) {
    const hours = (new Date(end) - new Date(start)) / 3600000;
    const rate12 = Number(vehicle.price_12h || vehicle.price_per_day || 0);
    const rate24 = Number(vehicle.price_24h || rate12 * 2 || 0);
    let rentalAmount;
    if (rentalType === '24h') rentalAmount = rate24;
    else if (hours > 24 && hours <= 48) rentalAmount = rate24 * 2;
    else if (hours > 48) rentalAmount = rate12 * Math.ceil(hours / 24);
    else rentalAmount = rate12;
    const delivery = document.getElementById('booking-delivery')?.checked ? 20000 : 0;
    const recovery = document.getElementById('booking-recovery')?.checked ? 20000 : 0;
    const days = Math.max(1, Math.ceil(hours / 24));
    const chauffeur = document.getElementById('booking-driver')?.checked ? 30000 * days : 0;
    return { hours, days, rate12, rate24, rentalAmount, delivery, recovery, chauffeur, total: rentalAmount + delivery + recovery + chauffeur };
}

function updateBookingQuote() {
    const vehicle = bookingVehicles.find(item => item.id === document.getElementById('booking-vehicle')?.value);
    const startDate = document.getElementById('booking-start-date')?.value, endDate = document.getElementById('booking-end-date')?.value;
    const startTime = document.getElementById('booking-start-time')?.value, endTime = document.getElementById('booking-end-time')?.value;
    const quote = document.getElementById('booking-quote');
    if (!vehicle || !startDate || !endDate || !startTime || !endTime || new Date(`${endDate}T${endTime}`) <= new Date(`${startDate}T${startTime}`)) { if (quote) quote.textContent = ''; return; }
    const q = calculateBookingQuote(vehicle, `${startDate}T${startTime}`, `${endDate}T${endTime}`, document.getElementById('booking-rental-type')?.value), deposit = Number(document.getElementById('booking-deposit')?.value || 0);
    if (quote) quote.textContent = `Estimation : location ${formatMGA(q.rentalAmount)} + livraison ${formatMGA(q.delivery)} + récupération ${formatMGA(q.recovery)} + chauffeur ${formatMGA(q.chauffeur)} = ${formatMGA(q.total)}. Acompte : ${formatMGA(deposit)}. Reste : ${formatMGA(Math.max(0, q.total - deposit))}.`;
}

function checkAvailability() {
    const start = document.getElementById('availability-start').value;
    const end = document.getElementById('availability-end').value;
    const list = document.getElementById('availability-list');
    if (!start || !end || new Date(end) <= new Date(start)) {
        list.innerHTML = '<p class="booking-error">Veuillez choisir une période valide.</p>';
        return;
    }
    const selectedVehicle = document.getElementById('availability-vehicle')?.value || 'all';
    list.innerHTML = bookingVehicles.filter(vehicle => selectedVehicle === 'all' || vehicle.id === selectedVehicle).map(vehicle => {
        const rawStatus = getVehicleAvailability(vehicle.id, `${start}T00:00:00`, `${end}T23:59:59`);
        const status = rawStatus === 'available' ? 'available' : 'reserved';
        return `<div class="availability-row"><div><strong>${vehicle.name}</strong><small>${formatMGA(vehicle.price_per_day)} / jour</small></div><span class="availability-badge ${status}">${status === 'available' ? 'Disponible' : 'Réservé'}</span></div>`;
    }).join('') || '<p class="muted">Aucun véhicule actif pour le moment.</p>';
}

async function submitReservation(event) {
    event.preventDefault();
    const result = document.getElementById('booking-result');
    const vehicle = bookingVehicles.find(item => item.id === document.getElementById('booking-vehicle').value);
    const startDate = document.getElementById('booking-start-date').value;
    const startTime = document.getElementById('booking-start-time').value;
    const endDate = document.getElementById('booking-end-date').value;
    const endTime = document.getElementById('booking-end-time').value;
    const start = startDate && startTime ? `${startDate}T${startTime}` : '';
    const end = endDate && endTime ? `${endDate}T${endTime}` : '';
    if (!vehicle || new Date(end) <= new Date(start)) {
        result.className = 'booking-result booking-error';
        result.textContent = 'Vérifiez le véhicule et les dates choisies.';
        return;
    }
    const availability = getVehicleAvailability(vehicle.id, start, end);
    if (availability !== 'available') {
        result.className = 'booking-result booking-error';
        result.textContent = `Cette voiture est ${availabilityLabel(availability).toLowerCase()} sur cette période.`;
        return;
    }
    const rentalType = document.getElementById('booking-rental-type').value;
    const quote = calculateBookingQuote(vehicle, start, end, rentalType);
    const deposit = Math.max(0, Number(document.getElementById('booking-deposit').value || 0));
    if (deposit > quote.total) { result.className = 'booking-result booking-error'; result.textContent = 'L’acompte ne peut pas dépasser le montant total.'; return; }
    const paymentMethod = document.getElementById('booking-payment-method').value || null;
    if (deposit > 0 && !paymentMethod) { result.className = 'booking-result booking-error'; result.textContent = 'Sélectionnez le mode de paiement de l’acompte.'; return; }
    const days = quote.days;
    const payload = {
        vehicle_id: vehicle.id,
        customer_name: document.getElementById('booking-name').value.trim(),
        customer_phone: document.getElementById('booking-phone').value.trim(),
        customer_email: document.getElementById('booking-email').value.trim() || null,
        customer_address: document.getElementById('booking-address').value.trim(),
        customer_license: document.getElementById('booking-license').value.trim(),
        customer_cin: document.getElementById('booking-cin').value.trim(),
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
        with_driver: document.getElementById('booking-driver').checked,
        rental_type: rentalType,
        rate_12h: quote.rate12,
        rate_24h: quote.rate24,
        daily_rate: quote.rate12,
        days,
        trip_from: document.getElementById('booking-trip-from').value.trim(),
        trip_to: document.getElementById('booking-trip-to').value.trim(),
        delivery_fee: quote.delivery,
        recovery_fee: quote.recovery,
        chauffeur_fee: quote.chauffeur,
        extra_fees: quote.delivery + quote.recovery,
        total_amount: quote.total,
        deposit_amount: deposit,
        payment_method: paymentMethod,
        mobile_reference: document.getElementById('booking-mobile-reference').value.trim() || null,
        mobile_number: document.getElementById('booking-mobile-number').value.trim() || null,
        notes: document.getElementById('booking-notes').value.trim() || null,
        status: deposit > 0 ? 'reserved' : 'pre_reserved'
    };
    const { data, error } = await window.rentCarSupabase.from('reservations').insert(payload).select('reference').single();
    if (error) {
        result.className = 'booking-result booking-error';
        result.textContent = 'Impossible d’enregistrer la demande pour le moment. Contactez-nous par WhatsApp.';
        console.error(error);
        return;
    }
    result.className = 'booking-result booking-success';
    result.textContent = deposit > 0 ? `Réservation ${data.reference} enregistrée avec acompte. La date est bloquée.` : `Demande ${data.reference} enregistrée. La date reste disponible jusqu’au paiement de l’acompte.`;
    document.getElementById('booking-form').reset();
    await loadBookingData();
}


async function verifyInvoiceOtp(event) {
    event.preventDefault();
    const result = document.getElementById('invoice-access-result');
    const reference = document.getElementById('invoice-reference').value.trim();
    const phone = document.getElementById('invoice-phone').value.trim();
    const otp = document.getElementById('invoice-otp').value.trim();
    const { data, error } = await window.rentCarSupabase.from('reservations').select('*,vehicles(name,make,model,registration_number)').eq('reference', reference).eq('customer_phone', phone).eq('invoice_released', true).eq('otp_code', otp).single();
    if (error || !data) { result.className = 'booking-result booking-error'; result.textContent = 'Référence, téléphone ou code OTP incorrect. La facture et le contrat sont accessibles après validation de l’acompte.'; return; }
    const typeLabel = data.rental_type === 'night' ? 'Nuit — 12 h (19h00 à 06h00)' : data.rental_type === '24h' ? '24 heures' : 'Jour — 12 h (07h00 à 18h00)';
    const rentalOnly = Number(data.total_amount||0) - Number(data.delivery_fee||0) - Number(data.recovery_fee||0) - Number(data.chauffeur_fee||0);
    const reste = Math.max(0, Number(data.total_amount||0) - Number(data.deposit_amount||0));
    const vehicle = `${data.vehicles?.make || ''} ${data.vehicles?.model || data.vehicles?.name || ''}`.trim();
    const shared = `<p>Référence : ${data.reference}<br>Client : ${data.customer_name}<br>Téléphone : ${data.customer_phone}<br>Adresse : ${data.customer_address || '—'}<br>Véhicule : ${vehicle}<br>Immatriculation : ${data.vehicles?.registration_number || '—'}<br>Période : ${new Date(data.start_at).toLocaleString('fr-FR')} → ${new Date(data.end_at).toLocaleString('fr-FR')}<br>Nombre de jour(s) : ${data.days || 1}<br>Formule : ${typeLabel}</p>`;
    const finance = `<p>Location : ${formatMGA(rentalOnly)}<br>Livraison : ${formatMGA(data.delivery_fee)}<br>Récupération : ${formatMGA(data.recovery_fee)}<br>Chauffeur : ${formatMGA(data.chauffeur_fee)} (30 000 Ar / jour × ${data.days || 1})<br>Acompte payé : ${formatMGA(data.deposit_amount)}</p><p class="total">Total : ${formatMGA(data.total_amount)}<br>Reste à payer : ${formatMGA(reste)}</p><p><b>Important :</b> prix hors carburant. Avec chauffeur, repas et hébergement du chauffeur exclus.</p>`;
    const html = `<html><head><title>Facture et contrat ${data.reference}</title><style>body{font:15px Arial;padding:35px;color:#0b1f33;max-width:820px;margin:auto;line-height:1.45}h1{color:#0d5c8f}h2{border-bottom:1px solid #ddd;padding-bottom:8px}.total{font-size:22px;font-weight:bold}.page-break{page-break-before:always}.sign{display:flex;justify-content:space-between;margin-top:90px}</style></head><body><h1>RENT CAR SERVICES</h1><p>67 Ha Nord Ouest, Parking FJKM SALEMA<br>034 91 207 26</p><h2>FACTURE</h2>${shared}${finance}<div class="page-break"><h1>RENT CAR SERVICES</h1><h2>CONTRAT DE LOCATION</h2>${shared}<p>Le présent contrat concerne la location du véhicule indiqué ci-dessus. Le locataire reconnaît avoir fourni les informations nécessaires et accepte les conditions de location, de vérification, de reprise et de restitution du véhicule.</p>${finance}<p>Le locataire doit présenter une pièce d’identité et un permis de conduire valide. Toute restitution tardive, dommage, perte de clé, accident ou utilisation non autorisée est soumise aux conditions du loueur.</p><div class="sign"><span>LOCATAIRE<br>Lu et approuvé<br><br>Signature :</span><span>LOUEUR<br>Lu et approuvé<br><br>Signature :</span></div></div><script>window.print()<\/script></body></html>`;
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
}

['booking-vehicle','booking-start-date','booking-start-time','booking-end-date','booking-end-time','booking-rental-type','booking-deposit','booking-delivery','booking-recovery','booking-driver'].forEach(id => document.getElementById(id)?.addEventListener('input', updateBookingQuote));


function syncRentalTimes() {
    const type = document.getElementById('booking-rental-type')?.value;
    const start = document.getElementById('booking-start-time'), end = document.getElementById('booking-end-time');
    if (!start || !end) return;
    if (type === 'day') { start.value = '07:00'; end.value = '18:00'; }
    if (type === 'night') { start.value = '19:00'; end.value = '06:00'; }
    if (type === '24h') { if (start.value === '07:00') end.value = '06:00'; else { start.value = '19:00'; end.value = '18:00'; } }
    updateBookingQuote();
}
document.getElementById('booking-rental-type')?.addEventListener('change', syncRentalTimes);
document.getElementById('booking-start-time')?.addEventListener('change', () => { if (document.getElementById('booking-rental-type')?.value === '24h') { document.getElementById('booking-end-time').value = document.getElementById('booking-start-time').value === '07:00' ? '06:00' : '18:00'; } updateBookingQuote(); });


function updatePaymentFields() {
    const method = document.getElementById('booking-payment-method')?.value;
    const visible = method === 'mobile_money';
    ['mobile-reference-field','mobile-number-field'].forEach(id => document.getElementById(id)?.classList.toggle('hidden', !visible));
    if (!visible) {
        const ref = document.getElementById('booking-mobile-reference'), number = document.getElementById('booking-mobile-number');
        if (ref) ref.value = '';
        if (number) number.value = '';
    }
}
document.getElementById('booking-payment-method')?.addEventListener('change', updatePaymentFields);
document.getElementById('availability-vehicle')?.addEventListener('change', checkAvailability);
updatePaymentFields();
