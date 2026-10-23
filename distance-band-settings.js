(() => {
  const rows = [
    { key: '0_30', input: 'distance-min-0-30' },
    { key: '30_100', input: 'distance-min-30-100' },
    { key: '100_200', input: 'distance-min-100-200' },
    { key: 'over_200', input: 'distance-min-over-200' }
  ];
  const result = () => document.getElementById('distance-band-settings-result');
  const client = () => window.rentCarSupabase;

  async function loadDistanceBandSettingsAdmin() {
    const status = result();
    if (!client()) return;
    if (status) status.textContent = 'Chargement…';
    const { data, error } = await client().from('distance_band_settings')
      .select('distance_band,minimum_days');
    if (error) {
      if (status) status.textContent = `Impossible de charger les réglages : ${error.message}`;
      return;
    }
    const values = new Map((data || []).map(row => [row.distance_band, row.minimum_days]));
    rows.forEach(({ key, input }) => {
      const element = document.getElementById(input);
      if (element && values.has(key)) element.value = values.get(key);
    });
    if (status) status.textContent = '';
  }

  async function saveDistanceBandSettings(event) {
    event.preventDefault();
    const status = result();
    const payload = rows.map(({ key, input }) => ({
      distance_band: key,
      minimum_days: Number(document.getElementById(input)?.value),
      updated_at: new Date().toISOString()
    }));
    if (payload.some(row => !Number.isInteger(row.minimum_days) || row.minimum_days < 1 || row.minimum_days > 90)) {
      if (status) status.textContent = 'Saisissez un nombre entier de jours entre 1 et 90 pour chaque palier.';
      return;
    }
    if (status) status.textContent = 'Enregistrement…';
    const { error } = await client().from('distance_band_settings').upsert(payload, { onConflict: 'distance_band' });
    if (error) {
      if (status) status.textContent = `Enregistrement impossible : ${error.message}`;
      return;
    }
    if (status) status.textContent = 'Durées enregistrées. Les devis et nouvelles réservations utiliseront ces valeurs.';
  }

  window.loadDistanceBandSettingsAdmin = loadDistanceBandSettingsAdmin;
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('distance-band-settings-form')?.addEventListener('submit', saveDistanceBandSettings);
  });
})();
