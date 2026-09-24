let siteConfig = {};
let activePromo = null;
function setClientTheme(theme) { document.body.dataset.theme = theme; localStorage.setItem("rentcar-theme", theme); }
function initClientTheme() { setClientTheme(localStorage.getItem("rentcar-theme") || "royal-night"); }

document.addEventListener('DOMContentLoaded', async () => {
    await initSite();
});

async function initSite() {
        initClientTheme();
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
let publicCars = [];
let publicRentalCounts = {};

function renderPublicCars() {
    const search = (document.getElementById('fleet-search')?.value || '').trim().toLowerCase();
    const transmission = document.getElementById('fleet-transmission')?.value || 'all';
    const seats = document.getElementById('fleet-seats')?.value || 'all';
    const maxPrice = Number(document.getElementById('fleet-max-price')?.value || Infinity);
    const sort = document.getElementById('fleet-sort')?.value || 'price-asc';
    let cars = publicCars.filter(car => {
        const haystack = `${car.nom} ${car.make || ''} ${car.model || ''}`.toLowerCase();
        return (!search || haystack.includes(search)) &&
            (transmission === 'all' || car.transmission === transmission) &&
            (seats === 'all' || String(car.places) === seats) &&
            Number(car.price_per_day || 0) <= maxPrice;
    });
    cars.sort((a,b) => sort === 'popular' ? (publicRentalCounts[b.id] || 0) - (publicRentalCounts[a.id] || 0) : sort === 'price-asc' ? Number(a.price_per_day||0)-Number(b.price_per_day||0) : sort === 'price-desc' ? Number(b.price_per_day||0)-Number(a.price_per_day||0) : String(a.nom).localeCompare(String(b.nom), 'fr'));
    document.getElementById('cars-grid').innerHTML = cars.map(car => `
        <div class="car-card">
            <div class="car-gallery">${(car.photos || []).map(photo => `<img src="${photo}" loading="lazy" alt="${car.nom}">`).join('')}</div>
            <div class="car-info">
                <h3>${car.nom}</h3>
                <p class="booking-mode-label">${car.driver_mode === 'with_driver' ? 'Location avec chauffeur' : 'Location sans chauffeur'}</p>
                <div class="car-price">${car.pricing ? `<span>12 h : ${car.pricing.half_day || '—'}</span><span>24 h : ${car.pricing.full_day || '—'}</span>` : car.prix}</div>
                <div class="car-tags"><span><i class="fas fa-cog"></i> ${car.transmission}</span><span><i class="fas fa-gas-pump"></i> ${car.carburant}</span><span><i class="fas fa-users"></i> ${car.places}</span></div>
                <p class="car-desc">${car.description}</p>
                <div class="car-actions"><button class="btn btn-primary btn-reserve" onclick="openBookingForVehicle('${car.id || ''}','${car.nom}')">Réserver</button><button class="btn btn-outline" onclick="openLongTermQuote('${car.nom}')">Contactez-nous</button><a href="https://wa.me/${siteConfig.footer.whatsapp}" target="_blank" class="btn btn-whatsapp btn-icon" aria-label="WhatsApp ${car.nom}"><i class="fab fa-whatsapp"></i></a><a href="tel:${siteConfig.footer.telephone.replace(/\s/g,'')}" class="btn btn-primary btn-icon" aria-label="Appeler ${car.nom}"><i class="fas fa-phone"></i></a></div>
            </div>
        </div>`).join('') || '<p class="fleet-empty">Aucune voiture ne correspond à vos critères.</p>';
}

function bindPublicCarFilters() {
    ['fleet-search','fleet-transmission','fleet-seats','fleet-max-price','fleet-sort'].forEach(id => document.getElementById(id)?.addEventListener('input', renderPublicCars));
}

async function loadCars() {
    if (!window.rentCarSupabase) {
        console.error('Supabase est indisponible : impossible de charger le catalogue des véhicules.');
        publicCars = [];
    } else {
        const { data: remoteCars, error: vehicleError } = await window.rentCarSupabase
            .from('vehicles')
            .select('id,name,slug,description,price_per_day,transmission,fuel,seats,status,image_urls,make,model,price_12h,price_24h,driver_mode,driver_fee,extra_driver_fee,trip_rates')
            .neq('status', 'inactive')
            .order('price_per_day',{ascending:true}).order('name',{ascending:true});
        if (vehicleError) console.error('Impossible de charger les véhicules depuis Supabase:', vehicleError);
        publicCars = !vehicleError && remoteCars?.length ? remoteCars.map(car => ({
            ...car,
            nom: car.name,
            prix: car.price_per_day ? `${formatMGA(car.price_per_day)} / jour` : 'Sur devis',
            pricing: { half_day: car.price_12h ? formatMGA(car.price_12h) : 'Sur devis', full_day: car.price_24h ? formatMGA(car.price_24h) : 'Sur devis' },
            places: car.seats,
            carburant: car.fuel || '—',
            photos: car.image_urls || [],
        })) : [];
        const { data: booked } = await window.rentCarSupabase.from('reservations').select('vehicle_id,status').neq('status','cancelled').limit(1000);
        publicRentalCounts = (booked || []).reduce((acc, row) => { if (row.vehicle_id) acc[row.vehicle_id] = (acc[row.vehicle_id] || 0) + 1; return acc; }, {});
    }
    const transmissions = [...new Set(publicCars.map(c => c.transmission).filter(v => v && v !== '—'))].sort();
    const seats = [...new Set(publicCars.map(c => c.places).filter(v => v && v !== '—'))].sort((a,b) => Number(a)-Number(b));
    document.getElementById('fleet-transmission').innerHTML = '<option value="all">Toutes</option>' + transmissions.map(v => `<option value="${v}">${v}</option>`).join('');
    document.getElementById('fleet-seats').innerHTML = '<option value="all">Toutes</option>' + seats.map(v => `<option value="${v}">${v} places</option>`).join('');
    bindPublicCarFilters();
    renderPublicCars();
}
// Musique et Divertissement
function escapeFunHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function getYouTubePlaylistId(link) {
    try {
        const url = new URL(link);
        return url.searchParams.get('list') || '';
    } catch (_) {
        return '';
    }
}

function renderYouTubePlaylist(playlist) {
    const frame = document.getElementById('youtube-playlist-frame');
    const empty = document.getElementById('youtube-playlist-empty');
    const external = document.getElementById('youtube-playlist-external');
    const title = document.getElementById('youtube-playlist-title');
    if (!frame || !empty || !external || !title) return;

    const playlistId = getYouTubePlaylistId(playlist?.link || '');
    if (!playlist || !playlistId) {
        frame.classList.add('hidden');
        external.classList.add('hidden');
        empty.classList.remove('hidden');
        title.textContent = 'Aucune playlist sélectionnée';
        return;
    }

    title.textContent = playlist.nom;
    frame.src = `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlistId)}&rel=0&modestbranding=1`;
    frame.classList.remove('hidden');
    empty.classList.add('hidden');
    external.href = playlist.link;
    external.classList.remove('hidden');
}

function bindEntertainmentPlayers(data) {
    const radioSelect = document.getElementById('radio-select');
    const radioPlayer = document.getElementById('radio-player');
    const radioTitle = document.getElementById('radio-current-title');
    const radioLogo = document.getElementById('radio-current-logo');
    const playlistSelect = document.getElementById('youtube-playlist-select');
    if (!radioSelect || !radioPlayer || !playlistSelect) return;

    radioSelect.innerHTML = '<option value="">Choisir une radio</option>' + data.radios.map((radio, index) => `<option value="${index}">${escapeFunHtml(radio.nom)}</option>`).join('');
    radioSelect.addEventListener('change', () => {
        const radio = radioSelect.value === '' ? null : data.radios[Number(radioSelect.value)];
        if (!radio) {
            radioPlayer.pause();
            radioPlayer.removeAttribute('src');
            radioPlayer.load();
            radioTitle.textContent = 'Aucune radio sélectionnée';
            radioLogo.removeAttribute('src');
            return;
        }
        radioPlayer.src = radio.url;
        radioPlayer.load();
        radioTitle.textContent = radio.nom;
        if (radio.logo) {
            radioLogo.src = radio.logo;
            radioLogo.alt = radio.nom;
        }
    });

    playlistSelect.innerHTML = '<option value="">Choisir une playlist YouTube</option>' + data.playlists.map((playlist, index) => `<option value="${index}">${escapeFunHtml(playlist.nom)}</option>`).join('');
    playlistSelect.addEventListener('change', () => renderYouTubePlaylist(playlistSelect.value === '' ? null : data.playlists[Number(playlistSelect.value)]));
    renderYouTubePlaylist(null);
}

async function loadFun() {
    const res = await fetch('fun.json', { cache: 'no-store' });
    const localData = await res.json();
    let data = { radios: localData.radios || [], playlists: localData.playlists || [] };
    if (window.rentCarSupabase) {
        const { data: custom } = await window.rentCarSupabase.from('entertainment_items').select('*').eq('active', true).order('sort_order');
        if (custom?.length) {
            const customRadios = custom.filter(item => item.kind === 'radio').map(item => ({ nom: item.name, logo: item.logo_url, url: item.stream_url }));
            const customPlaylists = custom.filter(item => item.kind === 'playlist').map(item => ({ nom: item.name, logo: item.logo_url, link: item.link_url }));
            data = { radios: [...data.radios, ...customRadios], playlists: [...data.playlists, ...customPlaylists] };
        }
    }

    data.radios = [...new Map(data.radios.filter(radio => radio?.url).map(radio => [radio.url, radio])).values()];
    data.playlists = [...new Map(data.playlists.filter(playlist => /(^|\.)youtube\.com|youtu\.be/i.test(playlist?.link || '')).map(playlist => [playlist.link, playlist])).values()];

    document.getElementById('radios-grid').innerHTML = `
        <div class="entertainment-panel">
            <div class="entertainment-panel-heading"><i class="fas fa-radio"></i><div><h3>Radios en direct</h3><p>Choisissez une station puis utilisez le lecteur audio.</p></div></div>
            <label class="entertainment-label" for="radio-select">Station radio</label>
            <select id="radio-select" class="entertainment-select"></select>
            <div class="radio-now-playing"><img id="radio-current-logo" class="radio-current-logo" alt=""><div><strong id="radio-current-title">Aucune radio sélectionnée</strong><span>La lecture démarre après votre action.</span></div></div>
            <audio id="radio-player" class="audio-player" controls preload="none"></audio>
        </div>
        <div class="entertainment-panel youtube-panel">
            <div class="entertainment-panel-heading"><i class="fab fa-youtube"></i><div><h3>Playlists YouTube</h3><p>Top 100 mondial, Madagascar et France.</p></div></div>
            <label class="entertainment-label" for="youtube-playlist-select">Playlist</label>
            <select id="youtube-playlist-select" class="entertainment-select"></select>
            <h4 id="youtube-playlist-title" class="youtube-playlist-title">Aucune playlist sélectionnée</h4>
            <div id="youtube-playlist-empty" class="youtube-playlist-empty">Sélectionnez une playlist pour afficher le lecteur.</div>
            <iframe id="youtube-playlist-frame" class="youtube-playlist-frame hidden" title="Lecteur de playlist YouTube" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
            <p class="multitask-note"><i class="fas fa-window-restore"></i> Pour écouter en multitâche, ouvrez la playlist dans un nouvel onglet. Brave est recommandé avec le mode image dans l’image lorsque disponible.</p>
            <a id="youtube-playlist-external" class="btn btn-primary hidden" target="_blank" rel="noopener noreferrer"><i class="fas fa-external-link-alt"></i> Ouvrir dans un nouvel onglet</a>
        </div>`;
    bindEntertainmentPlayers(data);
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
    syncBookingTripRates();
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
        db.from('vehicles').select('id,name,slug,description,price_per_day,transmission,fuel,seats,status,image_urls,make,model,registration_number,price_12h,price_24h,driver_mode,driver_fee,extra_driver_fee,trip_rates').eq('status', 'available').order('name'),
        db.from('reservations').select('vehicle_id,start_at,end_at,status').eq('status', 'reserved'),
        db.from('maintenance').select('vehicle_id,start_at,end_at')
    ]);
    if (vehicleError) {
        console.warn('Supabase booking data unavailable:', vehicleError.message);
        return;
    }
    bookingVehicles = vehicles || [];
    window.bookingVehicles = bookingVehicles;
    bookingReservations = reservations || [];
    bookingMaintenance = maintenance || [];
    const select = document.getElementById('booking-vehicle');
    if (select) select.innerHTML = bookingVehicles.map(v => `<option value="${v.id}">${v.name} — ${v.driver_mode === 'with_driver' ? 'Location avec chauffeur' : 'Location sans chauffeur'}</option>`).join('');
    syncBookingTripRates();
    window.updateClientDriverLabel?.();
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

function formatAvailabilityDate(value) {
    return new Date(value).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function availabilityConflict(vehicleId, start, end) {
    const blocks = bookingReservations.filter(item => item.vehicle_id === vehicleId && overlaps(start, end, item)).sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    const maintenance = bookingMaintenance.filter(item => item.vehicle_id === vehicleId && overlaps(start, end, item)).map(item => ({ ...item, status: 'maintenance' }));
    return [...blocks, ...maintenance].sort((a, b) => new Date(a.start_at) - new Date(b.start_at))[0] || null;
}

function availabilityExplanation(vehicle, start, end) {
    const conflict = availabilityConflict(vehicle.id, start, end);
    if (!conflict) return '';
    const conflictStart = new Date(conflict.start_at), conflictEnd = new Date(conflict.end_at), requestedStart = new Date(start);
    const kind = conflict.status === 'maintenance' ? 'indisponible pour maintenance' : 'réservée';
    let firstFree;
    const requestedEnd = new Date(end);
    if (conflictStart > requestedStart && conflictEnd < requestedEnd) firstFree = `au milieu de la période, à partir du ${formatAvailabilityDate(conflictEnd)}`;
    else if (conflictStart > requestedStart) firstFree = `avant cette période, jusqu’au ${formatAvailabilityDate(conflictStart)}`;
    else firstFree = `après cette période, à partir du ${formatAvailabilityDate(conflictEnd)}`;
    return `<p class="availability-detail"><strong>${vehicle.name} est ${kind} du ${formatAvailabilityDate(conflict.start_at)} au ${formatAvailabilityDate(conflict.end_at)}.</strong><br>Première date disponible : ${firstFree}.</p>`;
}

function availabilityLabel(status) {
    return { available: 'Disponible', pre_reserved: 'Pré-réservée', reserved: 'Réservée', maintenance: 'En maintenance', unknown: 'Dates à choisir' }[status] || status;
}

function tripRateAmount(rate) { return Number(rate?.price_per_day ?? rate?.rate ?? 0); }
function tripRateLabel(rate) { return rate?.label || [rate?.from, rate?.to].filter(Boolean).join(' → ') || 'Destination spéciale'; }
function syncBookingTripRates() {
    const vehicle = bookingVehicles.find(item => item.id === document.getElementById('booking-vehicle')?.value);
    const wrap = document.getElementById('booking-trip-rate-wrap');
    const select = document.getElementById('booking-trip-rate');
    if (!wrap || !select) return;
    const rates = vehicle?.driver_mode === 'with_driver' ? (vehicle.trip_rates || []).filter(rate => tripRateAmount(rate) > 0) : [];
    wrap.classList.toggle('hidden', !rates.length);
    select.innerHTML = '<option value="">Choisir une destination</option>' + rates.map(rate => `<option value="${rate.id}">${tripRateLabel(rate)} — ${formatMGA(tripRateAmount(rate))} / jour</option>`).join('');
}
function calculateBookingQuote(vehicle, start, end, rentalType) {
    const hours = (new Date(end) - new Date(start)) / 3600000;
    const rate12 = Number(vehicle.price_12h || vehicle.price_per_day || 0);
    const rate24 = Number(vehicle.price_24h || rate12 * 2 || 0);
    const billedHours = Math.max(1, Math.ceil(hours));
    const days = Math.max(1, Math.ceil(hours / 24));
    let rentalAmount;
    if (billedHours <= 12) rentalAmount = rate12;
    else if (billedHours <= 24) rentalAmount = rate24;
    else if (billedHours <= 36) rentalAmount = rate24 + rate12;
    else if (billedHours <= 48) rentalAmount = rate24 * 2;
    else rentalAmount = rate12 * days;
    const selectedTrip = document.getElementById('booking-trip-rate')?.value;
    const tripRate = vehicle.driver_mode === 'with_driver' ? (vehicle.trip_rates || []).find(item => item.id === selectedTrip) : null;
    if (tripRate) rentalAmount = tripRateAmount(tripRate) * days;
    const delivery = document.getElementById('booking-delivery')?.checked ? 20000 : 0;
    const recovery = document.getElementById('booking-recovery')?.checked ? 20000 : 0;
    const wantsDriver = document.getElementById('booking-driver')?.checked;
    const isWithDriver = vehicle.driver_mode === 'with_driver';
    const driverRate = Number(isWithDriver ? (vehicle.extra_driver_fee || 0) : (vehicle.driver_fee || 30000));
    const chauffeur = wantsDriver ? driverRate * days : 0;
    return { hours, billedHours, days, rate12, rate24, rentalAmount, delivery, recovery, chauffeur: tripRate ? 0 : chauffeur, tripRate, total: rentalAmount + delivery + recovery + (tripRate ? 0 : chauffeur) };
}

function updateBookingQuote() {
    const vehicle = bookingVehicles.find(item => item.id === document.getElementById('booking-vehicle')?.value);
    const startDate = document.getElementById('booking-start-date')?.value, endDate = document.getElementById('booking-end-date')?.value;
    const startTime = document.getElementById('booking-start-time')?.value, endTime = document.getElementById('booking-end-time')?.value;
    const quote = document.getElementById('booking-quote');
    const mini = document.getElementById('booking-mini-summary');
    if (!vehicle || !startDate || !endDate || !startTime || !endTime || new Date(`${endDate}T${endTime}`) <= new Date(`${startDate}T${startTime}`)) { if (quote) quote.textContent = ''; if (mini) mini.textContent = 'Choisissez une voiture et vos dates pour voir le récapitulatif financier.'; return; }
    const q = calculateBookingQuote(vehicle, `${startDate}T${startTime}`, `${endDate}T${endTime}`, document.getElementById('booking-rental-type')?.value), deposit = Number(document.getElementById('booking-deposit')?.value || 0);
    const promoDiscount = activePromo ? (activePromo.discount_type === 'percent' ? q.total * Number(activePromo.discount_value) / 100 : Number(activePromo.discount_value)) : 0; const finalTotal = Math.max(0, q.total - promoDiscount); if (quote) quote.textContent = `${q.tripRate ? `Trajet ${tripRateLabel(q.tripRate)} : ${formatMGA(tripRateAmount(q.tripRate))} / jour × ${q.days} jour(s)` : `Location ${formatMGA(q.rentalAmount)}`} + options ${formatMGA(q.delivery + q.recovery + q.chauffeur)}${promoDiscount ? ` − promo ${formatMGA(promoDiscount)}` : ''} = ${formatMGA(finalTotal)}. Hors carburant, repas et hébergement du chauffeur. Acompte : ${formatMGA(deposit)}. Reste à payer : ${formatMGA(Math.max(0, finalTotal - deposit))}.`; const balanceNote=document.getElementById('booking-balance-note'); if(balanceNote) balanceNote.textContent=`Reste à payer au moment de récupérer la voiture : ${formatMGA(Math.max(0, finalTotal - deposit))}.`;
    const dateFormat = value => new Date(value).toLocaleDateString('fr-FR');
    if (mini) mini.innerHTML = `<strong>${escapeFunHtml(vehicle.name || vehicle.nom || 'Véhicule')}</strong><span>${q.billedHours} h</span><strong>${formatMGA(q.rentalAmount)}</strong><span>Du ${dateFormat(`${startDate}T${startTime}`)} à ${startTime} au ${dateFormat(`${endDate}T${endTime}`)} à ${endTime}</span>`;
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
    const displayedVehicles = bookingVehicles.filter(vehicle => selectedVehicle === 'all' || vehicle.id === selectedVehicle);
    list.innerHTML = displayedVehicles.map(vehicle => {
        const rawStatus = getVehicleAvailability(vehicle.id, `${start}T00:00:00`, `${end}T23:59:59`);
        const status = rawStatus === 'available' ? 'available' : 'reserved';
        return `<div class="availability-row"><div><strong>${vehicle.name}</strong><small>${formatMGA(vehicle.price_per_day)} / jour</small>${status === 'reserved' ? availabilityExplanation(vehicle, `${start}T00:00:00`, `${end}T23:59:59`) : ''}</div><span class="availability-badge ${status}">${status === 'available' ? 'Disponible' : 'Réservé'}</span></div>`;
    }).join('') || '<p class="muted">Aucun véhicule actif pour le moment.</p>';
    const alternatives = bookingVehicles.filter(vehicle => vehicle.id !== selectedVehicle && getVehicleAvailability(vehicle.id, `${start}T00:00:00`, `${end}T23:59:59`) === 'available');
    if (selectedVehicle !== 'all' && alternatives.length) list.innerHTML += `<p class="availability-alternatives"><strong>Vous pouvez choisir une autre voiture disponible :</strong> ${alternatives.map(vehicle => vehicle.name).join(', ')}.</p>`;
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
        license_acquired_place: document.getElementById('booking-license-place').value.trim(),
        license_acquired_at: document.getElementById('booking-license-date').value || null,
        customer_cin: document.getElementById('booking-cin').value.trim(),
        cin_is_duplicate: document.getElementById('booking-cin-type').value === 'true',
        cin_acquired_place: document.getElementById('booking-cin-place').value.trim(),
        cin_acquired_at: document.getElementById('booking-cin-date').value || null,
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
        trip_rate_label: quote.tripRate ? tripRateLabel(quote.tripRate) : null,
        trip_rate_per_day: quote.tripRate ? tripRateAmount(quote.tripRate) : null,
        delivery_fee: quote.delivery,
        recovery_fee: quote.recovery,
        chauffeur_fee: quote.chauffeur,
        extra_fees: quote.delivery + quote.recovery,
        total_amount: Math.max(0, quote.total - (activePromo ? (activePromo.discount_type === 'percent' ? quote.total * Number(activePromo.discount_value) / 100 : Number(activePromo.discount_value)) : 0)),
        promo_code: document.getElementById('booking-promo')?.value.trim().toUpperCase() || null,
        promo_discount: activePromo ? (activePromo.discount_type === 'percent' ? quote.total * Number(activePromo.discount_value) / 100 : Number(activePromo.discount_value)) : 0,
        deposit_amount: deposit,
        payment_method: paymentMethod,
        mobile_reference: document.getElementById('booking-mobile-reference').value.trim() || null,
        mobile_number: document.getElementById('booking-mobile-number').value.trim() || null,
        notes: document.getElementById('booking-notes').value.trim() || null,
        status: deposit > 0 ? 'reserved' : 'pre_reserved'
    };
    const { data, error } = await window.rentCarSupabase.from('reservations').insert(payload).select('id,reference').single();
    if (error) {
        result.className = 'booking-result booking-error';
        result.textContent = 'Impossible d’enregistrer la demande pour le moment. Contactez-nous par WhatsApp.';
        console.error(error);
        return;
    }
    const docs = new FormData();
    docs.append('reservation_id', data.id);
    docs.append('customer_phone', payload.customer_phone);
    const files = [
        ['cinRecto', document.getElementById('booking-cin-recto')?.files?.[0]],
        ['cinVerso', document.getElementById('booking-cin-verso')?.files?.[0]],
        ['permisRecto', document.getElementById('booking-license-recto')?.files?.[0]]
    ];
    files.forEach(([name, file]) => { if (file) docs.append(name, file, file.name); });
    let documentMessage = '';
    if (files.some(([, file]) => file)) {
        const upload = await window.rentCarSupabase.functions.invoke('upload-identity-documents', { body: docs });
        if (upload.error || upload.data?.error) {
            console.error('identity document upload failed', upload.error || upload.data?.error);
            documentMessage = ' Les photos pourront être renvoyées lors de la signature du contrat.';
        } else if (upload.data?.uploaded?.length) {
            documentMessage = ` ${upload.data.uploaded.length} photo(s) sécurisée(s) rattachée(s) à la réservation.`;
        }
    }
    result.className = 'booking-result booking-success';
    result.textContent = deposit > 0 ? `Réservation ${data.reference} enregistrée avec acompte. La date est bloquée.${documentMessage}` : `Demande ${data.reference} enregistrée. La date reste disponible jusqu’au paiement de l’acompte.${documentMessage}`;
    document.getElementById('booking-form').reset(); activePromo = null; activePromo = null;
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
    const contractArticles = `<h2>Article 2 : Conditions du locataire</h2><p>Le locataire doit être âgé d’au moins 21 ans et détenir un permis valide depuis au moins 2 ans. Il doit présenter une pièce d’identité et une copie du permis de conduire. Il doit être solvable, assuré et conducteur déclaré par écrit dans le présent contrat.</p><h2>Article 3 : Zone et conditions d’utilisation</h2><p>Le véhicule est autorisé à circuler dans la commune d’Antananarivo et jusqu’à un rayon maximal de 30 kilomètres, sauf accord écrit préalable du loueur. Tout déplacement hors zone sans autorisation peut être facturé 1 000 Ariary par kilomètre supplémentaire, selon le compteur ou le GPS. Le locataire doit respecter le code de la route et utiliser le véhicule avec soin. Il est interdit de l’utiliser pour une activité commerciale ou professionnelle rémunérée, notamment comme taxi ou pour le transport via InDrive, sauf autorisation écrite préalable. Sont également interdits le transport illégal, les courses, les marchandises dangereuses, la surcharge et les routes incompatibles avec le véhicule.</p><h2>Article 4 : Prêt, sous-location, vente et fraude</h2><p>Le véhicule reste la propriété exclusive du loueur. Il est interdit de le prêter, céder, louer, re-louer, sous-louer, vendre, tenter de vendre, mettre en gage, publier une annonce à son sujet ou percevoir un paiement pour sa remise à un tiers. Toute fausse identité, faux document, dissimulation du conducteur, fausse signature, fausse déclaration ou manœuvre frauduleuse peut entraîner la reprise immédiate, la résiliation et une plainte.</p><h2>Article 5 : État, carburant et restitution</h2><p>Un état des lieux, le kilométrage, le carburant, les équipements, accessoires et clés sont vérifiés avant et après la location. Des photos ou vidéos datées peuvent être transmises par WhatsApp. Le véhicule doit être rendu à la date et à l’heure convenues avec le même niveau de carburant et les mêmes équipements. Le carburant manquant est facturé avec 20 000 Ariary de frais de service. En cas de retard : jusqu’à 1 heure, 10 000 Ariary ; de plus d’1 heure à 3 heures, 25 000 Ariary par heure entamée ; au-delà de 3 heures, une journée supplémentaire.</p><h2>Article 6 : Accident, panne, casse et frais</h2><p>Le locataire doit assurer la sécurité, prévenir immédiatement le loueur, communiquer le lieu, prendre des photos, suivre ses instructions et faire les démarches nécessaires. Aucune réparation, modification ou remorquage ne peut être engagé sans accord du loueur, sauf urgence de sécurité. Les frais directement liés à une faute, négligence, mauvaise utilisation, sortie de zone ou autre manquement sont à la charge du locataire.</p><h2>Article 7 : Vol, clés et non-restitution</h2><p>En cas de vol, disparition ou non-restitution, le locataire doit prévenir le loueur, contacter les autorités, déposer plainte, transmettre le récépissé et remettre les clés, documents et accessoires encore en sa possession. La perte ou détérioration des clés et les frais de remplacement peuvent être facturés.</p><h2>Article 8 : Vérification et reprise du véhicule</h2><p>Le loueur peut vérifier à tout moment l’état, la localisation, le kilométrage et les conditions d’utilisation. Il peut reprendre le véhicule sans préavis en cas de non-paiement, fraude, usage interdit, sortie non autorisée, accident, immobilisation, disparition ou risque sérieux de perte. Un état des lieux de reprise est établi dans la mesure du possible.</p><h2>Article 9 : Remboursement en cas de retrait anticipé</h2><p>Si le retrait n’est pas imputable au locataire, le prix de la période restant à courir est remboursé au prorata des jours ou heures non utilisés. Les périodes commencées et les frais de livraison, récupération ou prestations déjà exécutées ne sont pas remboursés. Aucun remboursement n’est dû si le retrait est causé par un manquement du locataire.</p><h2>Article 10 : Responsabilité financière et règlement</h2><p>Aucune caution n’est demandée, mais le locataire reste responsable des dommages, pertes, retards, amendes, fourrière, carburant, clés, accessoires et autres frais qui lui sont imputables. Les sommes certaines, exigibles et non contestées sont payables dans les 10 jours.</p><h2>Article 11 : Acceptation</h2><p>Le locataire reconnaît avoir lu, compris et accepté les conditions du présent contrat, notamment celles relatives à la zone, aux usages interdits, à la vente, à la sous-location, à la fraude, à la vérification, à la reprise et au remboursement.</p>`;
    const html = `<html><head><title>Facture et contrat ${data.reference}</title><style>body{font:15px Arial;padding:35px;color:#0b1f33;max-width:820px;margin:auto;line-height:1.45}h1{color:#0d5c8f}h2{border-bottom:1px solid #ddd;padding-bottom:8px}.total{font-size:22px;font-weight:bold}.page-break{page-break-before:always}.sign{display:flex;justify-content:space-between;margin-top:90px}</style></head><body><h1>Rent Car Service</h1><p>67 Ha Nord Ouest, Parking FJKM SALEMA<br>034 91 207 26</p><h2>FACTURE</h2>${shared}${finance}<div class="page-break"><h1>Rent Car Service</h1><h2>CONTRAT DE LOCATION</h2>${shared}<p>Le présent contrat concerne la location du véhicule indiqué ci-dessus. Le locataire reconnaît avoir fourni les informations nécessaires et accepte les conditions de location, de vérification, de reprise et de restitution du véhicule.</p>${finance}<p>Le locataire doit présenter une pièce d’identité et un permis de conduire valide. Toute restitution tardive, dommage, perte de clé, accident ou utilisation non autorisée est soumise aux conditions du loueur.</p><div class="sign"><span>LOCATAIRE<br>Lu et approuvé<br><br>Signature :</span><span>LOUEUR<br>Lu et approuvé<br><br>Signature :</span></div></div><script>window.print()<\/script></body></html>`;
    const win = window.open('', '_blank'); win.document.write(html); win.document.close();
}

['booking-vehicle','booking-start-date','booking-start-time','booking-end-date','booking-end-time','booking-rental-type','booking-deposit','booking-delivery','booking-recovery','booking-driver','booking-trip-rate'].forEach(id => document.getElementById(id)?.addEventListener('input', updateBookingQuote));
document.getElementById('booking-vehicle')?.addEventListener('change', () => { syncBookingTripRates(); updateBookingQuote(); });


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


async function validatePromoCode() { const input=document.getElementById('booking-promo'); const code=input?.value.trim().toUpperCase(); activePromo=null; if(code && window.rentCarSupabase){ const {data}=await window.rentCarSupabase.from('promo_codes').select('code,discount_type,discount_value').eq('code',code).eq('active',true).maybeSingle(); activePromo=data||null; input.setCustomValidity(data?'':'Code promo invalide ou inactif.'); } else if(input) input.setCustomValidity(''); updateBookingQuote(); }
document.getElementById('booking-promo')?.addEventListener('change', validatePromoCode);
document.getElementById('booking-promo')?.addEventListener('blur', validatePromoCode);

async function validatePromoCode() { const input=document.getElementById('booking-promo'); const code=input?.value.trim().toUpperCase(); activePromo=null; if(code && window.rentCarSupabase){ const {data}=await window.rentCarSupabase.from('promo_codes').select('code,discount_type,discount_value').eq('code',code).eq('active',true).maybeSingle(); activePromo=data||null; input.setCustomValidity(data?'':'Code promo invalide ou inactif.'); } else if(input) input.setCustomValidity(''); updateBookingQuote(); }
document.getElementById('booking-promo')?.addEventListener('change', validatePromoCode);
document.getElementById('booking-promo')?.addEventListener('blur', validatePromoCode);

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
