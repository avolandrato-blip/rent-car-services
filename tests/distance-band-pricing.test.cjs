const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('le devis client recalcule lors du changement de palier et utilise les jours facturés', () => {
  const script = read('script.js');
  assert.match(script, /booking-distance-band'\)\?\.addEventListener\('change', \(\) => \{/);
  assert.match(script, /refreshBookingVehicleOptions\(selectedId\);[\s\S]*updateBookingQuote\(\);/);
  assert.match(script, /if \(days < band\.minDays\)/);
  assert.doesNotMatch(script, /if \(hours < band\.minHours\)/);
});

test('les durées minimales sont de 2, 3 et 4 jours pour les trois paliers éloignés', () => {
  const script = read('script.js');
  assert.match(script, /'30_100': \{[^\n]*minDays: 2/);
  assert.match(script, /'100_200': \{[^\n]*minDays: 3/);
  assert.match(script, /'over_200': \{[^\n]*minDays: 4, minHours: 96/);
  assert.match(read('20261008_distance_band_pricing.sql'), /when '100_200' then 3 else 4 end/);
  assert.match(read('20261008_distance_band_pricing.sql'), /if v_days < v_minimum_days then/);
  assert.match(read('supabase/migrations/20261009_distance_band_minimum_days.sql'), /then 3 else 4 end/);
});

test('la règle du contrat et les conditions client affichent quatre jours minimum au-delà de 200 km', () => {
  assert.match(read('contract-terms.js'), /minimumLabel: 'Minimum 4 jours'/);
  assert.match(read('data_cards.json'), /minimum 4 jours/);
  assert.doesNotMatch(read('contract-terms.js'), /Minimum 5 jours/);
  assert.doesNotMatch(read('data_cards.json'), /minimum 5 jours/);
});

test('la Hyundai i30 calcule 400 000 Ar sur deux jours facturés au palier 30–100 km', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('const distanceBandConfig =');
  const end = script.indexOf('function updateBookingQuote()', start);
  assert.ok(start >= 0 && end > start, 'configuration et moteur de devis présents');
  const controls = {
    'booking-distance-band': { value: '30_100' },
    'booking-delivery': { checked: false },
    'booking-recovery': { checked: false },
    'booking-driver': { checked: false }
  };
  const context = { document: { getElementById: id => controls[id] || null } };
  vm.runInNewContext(`${script.slice(start, end)}; globalThis.quote = calculateBookingQuote;`, context);
  const quote = context.quote(
    { price_12h: 150000, price_30_100_per_day: 200000, driver_mode: 'without_driver', driver_fee: 30000 },
    '2026-11-01T07:00',
    '2026-11-02T18:00',
    'day'
  );
  assert.equal(quote.days, 2);
  assert.equal(quote.total, 400000);
  assert.equal(quote.requiresQuote, false);
});

test('le palier >200 km calcule sur quatre jours et demande un devis en dessous du minimum', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('const distanceBandConfig =');
  const end = script.indexOf('function updateBookingQuote()', start);
  const controls = {
    'booking-distance-band': { value: 'over_200' },
    'booking-delivery': { checked: false },
    'booking-recovery': { checked: false },
    'booking-driver': { checked: false }
  };
  const context = { document: { getElementById: id => controls[id] || null } };
  vm.runInNewContext(`${script.slice(start, end)}; globalThis.quote = calculateBookingQuote;`, context);
  const vehicle = { price_over_200_per_day: 300000, driver_mode: 'without_driver' };
  const valid = context.quote(vehicle, '2026-11-01T07:00', '2026-11-05T07:00', 'day');
  assert.equal(valid.days, 4);
  assert.equal(valid.total, 1200000);
  assert.equal(valid.requiresQuote, false);
  const short = context.quote(vehicle, '2026-11-01T07:00', '2026-11-03T07:00', 'day');
  assert.equal(short.requiresQuote, true);
  assert.match(short.quoteReason, /4 jour/);
});

test('le choix de l’i30 manuelle ou de la Pride manuelle affiche les quatre tarifs PK cumulatifs', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('const distanceBandConfig =');
  const end = script.indexOf('function updateBookingQuote()', start);
  const panel = { hidden: false, innerHTML: '' };
  const options = ['0_30', '30_100', '100_200', 'over_200'].map(value => ({ value, textContent: '' }));
  const controls = {
    'booking-distance-band': { value: '30_100', options },
    'booking-distance-prices': panel
  };
  const context = {
    document: { getElementById: id => controls[id] || null },
    escapeFunHtml: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
  };
  vm.runInNewContext(`${script.slice(start, end)}; globalThis.renderPrices = renderBookingDistancePrices;`, context);
  context.renderPrices({
    name: 'Hyundai i30',
    make: 'Hyundai',
    model: 'i30',
    transmission: 'Manuelle',
    price_per_day: 150000,
    price_12h: 150000,
    price_24h: 180000,
    price_30_100_per_day: 200000,
    price_100_200_per_day: 250000,
    price_over_200_per_day: 300000
  });
  assert.equal(panel.hidden, false);
  for (const price of ['150.000 Ar / 12 h', '180.000 Ar', '200.000 Ar/jour', '250.000 Ar/jour', '300.000 Ar/jour']) assert.ok(panel.innerHTML.includes(price), price);
  for (const label of ['Tana -> 30 km', 'Tana -> 100 km', 'Tana -> 200 km', 'Tana -> +200 km']) assert.ok(panel.innerHTML.includes(label), label);
  assert.match(panel.innerHTML, /Palier choisi/);
  assert.match(panel.innerHTML, /Minimum 2 jours/);
  assert.deepEqual(options.map(option => option.textContent), [
    'Tana -> 30 km — 12 h : 150.000 Ar · 24 h : 180.000 Ar',
    'Tana -> 100 km — 200.000 Ar/jour · min. 2 j',
    'Tana -> 200 km — 250.000 Ar/jour · min. 3 j',
    'Tana -> +200 km — 300.000 Ar/jour · min. 4 j'
  ]);
  assert.ok(options.every(option => !option.textContent.includes('1 000 Ar/km')));
  context.renderPrices({
    name: 'PRIDE Manuelle', make: 'Kia', model: 'Pride', transmission: 'Manuelle',
    price_per_day: 150000, price_12h: 150000, price_24h: 180000,
    price_30_100_per_day: 200000, price_100_200_per_day: 250000, price_over_200_per_day: 300000
  });
  assert.ok(panel.innerHTML.includes('Tana -> +200 km'));
  assert.ok(options[1].textContent.startsWith('Tana -> 100 km'));
  context.renderPrices({ name: 'PRIDE Automatique', model: 'Pride', transmission: 'Automatique', price_per_day: 140000 });
  assert.ok(options[1].textContent.startsWith('Tana -> 100 km'));
  const publicPage = read('index.html');
  const bandSelect = publicPage.match(/<select id="booking-distance-band"[\s\S]*?<\/select>/)?.[0] || '';
  assert.ok(bandSelect);
  assert.doesNotMatch(bandSelect, /1 000 Ar\/km/);
});

test('à 30 km, toutes les voitures sont triées par prix avec disponibilité selon les dates', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('function refreshBookingVehicleOptions(');
  const end = script.indexOf('\n}', start) + 2;
  assert.ok(start >= 0 && end > start, 'fonction de rafraîchissement présente');
  const groups = [
    { id: 'expensive', displayName: 'Voiture chère', vehicle: { name: 'Voiture chère', price_per_day: 250000 } },
    { id: 'cheap', displayName: 'Voiture moins chère', vehicle: { name: 'Voiture moins chère', price_per_day: 100000 } }
  ];
  const select = {
    value: 'expensive',
    options: [],
    set innerHTML(markup) {
      this.options = [...markup.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(([, value, textContent]) => ({ value, textContent }));
      this.value = this.options[0]?.value || '';
    }
  };
  const context = {
    document: { getElementById: id => id === 'booking-vehicle' ? select : id === 'booking-distance-band' ? { value: '30_100' } : null },
    window: { bookingFleets: groups },
    pendingBookingFleetId: '',
    bookingVehicleRateForBand: (group, band) => band === '30_100' ? group.vehicle.price_30_100_per_day : 0,
    formatMGA: value => `${value} Ar`,
    escapeFunHtml: value => String(value),
    bookingAvailabilityLoaded: true,
    bookingSlotAvailability: id => ({ available: id === 'cheap' })
  };
  context.document.getElementById = id => id === 'booking-vehicle' ? select : id === 'booking-distance-band' ? { value: '0_30' } : id === 'booking-start-date' ? { value: '2026-11-01' } : id === 'booking-start-time' ? { value: '07:00' } : id === 'booking-end-date' ? { value: '2026-11-02' } : id === 'booking-end-time' ? { value: '18:00' } : null;
  context.bookingVehicleRateForBand = group => group.vehicle.price_per_day;
  vm.runInNewContext(`${script.slice(start, end)}; refreshBookingVehicleOptions('expensive');`, context);
  assert.deepEqual(select.options.map(option => option.value), ['', 'cheap', 'expensive']);
  assert.equal(select.value, 'expensive');
  assert.match(select.options[1].textContent, /100000 Ar \/ jour — Disponible aux dates choisies/);
  assert.match(select.options[2].textContent, /250000 Ar \/ jour — Indisponible aux dates choisies/);
});

test('à 100 km et plus, toute la flotte reste visible et les voitures sans tarif sont indiquées sur devis', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('function refreshBookingVehicleOptions(');
  const end = script.indexOf('\n}', start) + 2;
  const groups = [
    { id: 'city-only', displayName: 'Voiture Tana seulement', vehicle: { name: 'Voiture Tana seulement', price_per_day: 100000 } },
    { id: 'province', displayName: 'Voiture province', vehicle: { name: 'Voiture province', price_per_day: 250000, price_30_100_per_day: 200000, price_100_200_per_day: 300000 } }
  ];
  const select = { value: 'city-only', options: [], set innerHTML(markup) { this.options = [...markup.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(([, value, textContent]) => ({ value, textContent })); this.value = this.options[0]?.value || ''; } };
  const context = {
    document: { getElementById: id => id === 'booking-vehicle' ? select : id === 'booking-distance-band' ? { value: '100_200' } : null },
    window: { bookingFleets: groups }, pendingBookingFleetId: '',
    bookingVehicleRateForBand: (group, band) => band === '100_200' ? group.vehicle.price_100_200_per_day || 0 : group.vehicle.price_per_day || 0,
    formatMGA: value => `${value} Ar`, escapeFunHtml: value => String(value)
  };
  vm.runInNewContext(`${script.slice(start, end)}; refreshBookingVehicleOptions('city-only');`, context);
  assert.deepEqual(select.options.map(option => option.value), ['', 'province', 'city-only']);
  assert.equal(select.value, 'city-only');
  assert.match(select.options[2].textContent, /Sans tarif pour ce palier — sur devis/);
});

test('aucune voiture n’est sélectionnée automatiquement si le client n’en a pas choisi', () => {
  const vm = require('node:vm');
  const script = read('script.js');
  const start = script.indexOf('function refreshBookingVehicleOptions(');
  const end = script.indexOf('\n}', start) + 2;
  const groups = [{ id: 'first', displayName: 'Première voiture', vehicle: { price_per_day: 100000 } }];
  const select = { value: '', options: [], set innerHTML(markup) { this.options = [...markup.matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)].map(([, value]) => ({ value })); this.value = this.options[0]?.value || ''; } };
  const context = {
    document: { getElementById: id => id === 'booking-vehicle' ? select : id === 'booking-distance-band' ? { value: '0_30' } : null },
    window: { bookingFleets: groups }, pendingBookingFleetId: '',
    bookingVehicleRateForBand: group => group.vehicle.price_per_day,
    formatMGA: value => `${value} Ar`, escapeFunHtml: value => String(value)
  };
  vm.runInNewContext(`${script.slice(start, end)}; refreshBookingVehicleOptions();`, context);
  assert.equal(select.value, '');
  assert.deepEqual(select.options.map(option => option.value), ['', 'first']);
});
