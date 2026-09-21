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
    const res = await fetch('cars.json');
    const data = await res.json();
    
    document.getElementById('cars-grid').innerHTML = data.liste.map(car => `
        <div class="car-card">
            <div class="car-gallery">
                ${car.photos.map(photo => `<img src="${photo}" loading="lazy">`).join('')}
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
                    <button class="btn btn-primary btn-reserve" onclick="prefill('${car.nom}')">Réserver</button>
                    <a href="https://wa.me/${siteConfig.footer.whatsapp}" target="_blank" class="btn btn-whatsapp btn-icon" aria-label="WhatsApp ${car.nom}">
                        <i class="fab fa-whatsapp"></i>
                    </a>
                    <a href="tel:${siteConfig.footer.telephone.replace(/\s/g,'')}" class="btn btn-primary btn-icon" aria-label="Appeler ${car.nom}">
                        <i class="fas fa-phone"></i>
                    </a>
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
        db.from('reservations').select('vehicle_id,start_at,end_at,status').in('status', ['pre_reserved', 'reserved']),
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

function checkAvailability() {
    const start = document.getElementById('availability-start').value;
    const end = document.getElementById('availability-end').value;
    const list = document.getElementById('availability-list');
    if (!start || !end || new Date(end) <= new Date(start)) {
        list.innerHTML = '<p class="booking-error">Veuillez choisir une période valide.</p>';
        return;
    }
    list.innerHTML = bookingVehicles.map(vehicle => {
        const status = getVehicleAvailability(vehicle.id, `${start}T00:00:00`, `${end}T23:59:59`);
        return `<div class="availability-row"><div><strong>${vehicle.name}</strong><small>${formatMGA(vehicle.price_per_day)} / jour</small></div><span class="availability-badge ${status}">${availabilityLabel(status)}</span></div>`;
    }).join('') || '<p class="muted">Aucun véhicule actif pour le moment.</p>';
}

async function submitReservation(event) {
    event.preventDefault();
    const result = document.getElementById('booking-result');
    const vehicle = bookingVehicles.find(item => item.id === document.getElementById('booking-vehicle').value);
    const start = document.getElementById('booking-start').value;
    const end = document.getElementById('booking-end').value;
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
    const days = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000));
    const payload = {
        vehicle_id: vehicle.id,
        customer_name: document.getElementById('booking-name').value.trim(),
        customer_phone: document.getElementById('booking-phone').value.trim(),
        customer_email: document.getElementById('booking-email').value.trim() || null,
        start_at: new Date(start).toISOString(),
        end_at: new Date(end).toISOString(),
        with_driver: document.getElementById('booking-driver').checked,
        daily_rate: vehicle.price_per_day,
        days,
        total_amount: vehicle.price_per_day * days,
        notes: document.getElementById('booking-notes').value.trim() || null,
        status: 'pre_reserved'
    };
    const { data, error } = await window.rentCarSupabase.from('reservations').insert(payload).select('reference').single();
    if (error) {
        result.className = 'booking-result booking-error';
        result.textContent = 'Impossible d’enregistrer la demande pour le moment. Contactez-nous par WhatsApp.';
        console.error(error);
        return;
    }
    result.className = 'booking-result booking-success';
    result.textContent = `Demande ${data.reference} envoyée. Nous vous contacterons pour confirmer la réservation.`;
    document.getElementById('booking-form').reset();
    await loadBookingData();
}
