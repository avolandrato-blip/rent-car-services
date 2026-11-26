(() => {
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const money = value => `${Math.round(Number(value) || 0).toLocaleString('fr-FR')} Ar`;
  const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('fr-FR') : '—';
  const state = { vehicles: [], signature: '', loading: false, loaded: false };

  function addRow() {
    const list = $('proforma-lines');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'proforma-line';
    row.innerHTML = `
      <label class="proforma-vehicle">Véhicule
        <select class="proforma-line-vehicle" required><option value="">Choisir un véhicule…</option>${state.vehicles.map(vehicle => `<option value="${escapeHtml(vehicle.id)}" data-rate="${Number(vehicle.price_per_day || 0)}">${escapeHtml(vehicle.name || [vehicle.make, vehicle.model].filter(Boolean).join(' ') || 'Véhicule')} — ${escapeHtml(vehicle.transmission || '—')}</option>`).join('')}</select>
      </label>
      <label>Départ<input class="proforma-line-start" type="date" required></label>
      <label>Retour<input class="proforma-line-end" type="date" required></label>
      <label>Prix convenu / jour (Ar)<input class="proforma-line-rate" type="number" min="0" step="1000" value="0" required></label>
      <div class="proforma-line-total" aria-live="polite">Montant : —</div>
      <button type="button" class="btn outline proforma-remove" aria-label="Retirer cette ligne">Retirer</button>`;
    list.append(row);
    row.querySelector('.proforma-line-vehicle').addEventListener('change', event => {
      const rate = Number(event.target.selectedOptions[0]?.dataset.rate || 0);
      row.querySelector('.proforma-line-rate').value = rate;
      updateRow(row);
    });
    row.querySelectorAll('input').forEach(input => input.addEventListener('input', () => updateRow(row)));
    row.querySelector('.proforma-remove').addEventListener('click', () => { row.remove(); updateTotals(); });
    updateRow(row);
  }

  function getLine(row) {
    const select = row.querySelector('.proforma-line-vehicle');
    const vehicle = state.vehicles.find(item => item.id === select.value);
    const start = row.querySelector('.proforma-line-start').value;
    const end = row.querySelector('.proforma-line-end').value;
    const rate = Number(row.querySelector('.proforma-line-rate').value);
    const days = start && end ? Math.floor((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) : 0;
    return { vehicle, start, end, days, rate, amount: days > 0 && rate >= 0 ? days * rate : 0 };
  }

  function updateRow(row) {
    const line = getLine(row);
    const output = row.querySelector('.proforma-line-total');
    output.textContent = line.days > 0 ? `${line.days} jour(s) · ${money(line.amount)}` : 'Choisissez des dates valides';
    updateTotals();
  }

  function updateTotals() {
    const lines = [...document.querySelectorAll('.proforma-line')].map(getLine);
    const total = lines.reduce((sum, item) => sum + item.amount, 0);
    const target = $('proforma-grand-total');
    if (target) target.textContent = money(total);
  }

  async function loadData() {
    if (state.loading) return;
    state.loading = true;
    const db = window.rentCarSupabase;
    try {
      if (!db) throw new Error('Connexion à la base de données indisponible.');
      const [vehiclesResponse, signatureResponse] = await Promise.all([
        db.from('vehicles').select('id,name,make,model,transmission,price_per_day,status').in('status', ['available', 'reserved']).order('name').limit(500),
        db.from('admin_signature_settings').select('signature_data').eq('id', 'lessor').maybeSingle()
      ]);
      if (vehiclesResponse.error) throw vehiclesResponse.error;
      if (signatureResponse.error) console.warn('Signature du loueur non chargée:', signatureResponse.error.message);
      state.vehicles = vehiclesResponse.data || [];
      state.signature = signatureResponse.data?.signature_data || '';
      state.loaded = true;
      const note = $('proforma-signature-note');
      if (note) note.textContent = state.signature ? 'Votre signature enregistrée sera ajoutée par défaut au document.' : 'Aucune signature enregistrée : ajoutez-la dans « Ma signature » pour l’inclure automatiquement.';
      $('proforma-lines').replaceChildren();
      addRow();
      $('proforma-status').textContent = state.vehicles.length ? '' : 'Aucun véhicule sélectionnable pour le moment.';
    } catch (error) {
      $('proforma-status').textContent = `Chargement impossible : ${error.message || error}`;
    } finally {
      state.loading = false;
    }
  }

  function createProforma() {
    const form = $('proforma-form');
    if (!form.reportValidity()) return;
    const lines = [...document.querySelectorAll('.proforma-line')].map(getLine);
    if (!lines.length || lines.some(line => !line.vehicle || !line.start || !line.end || line.days <= 0 || !Number.isFinite(line.rate) || line.rate < 0)) {
      alert('Chaque ligne doit contenir un véhicule, une période valide et un prix positif ou nul.');
      return;
    }
    const clientName = $('proforma-client-name').value.trim();
    const clientPhone = $('proforma-client-phone').value.trim();
    const clientAddress = $('proforma-client-address').value.trim();
    const issueDate = $('proforma-issue-date').value;
    const reference = $('proforma-reference').value.trim() || `PF-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const logo = new URL('images/logo.png', location.href).href;
    const stamp = new URL('images/owner-stamp.png', location.href).href;
    const signature = $('proforma-include-signature').checked && /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(state.signature)
      ? state.signature
      : '';
    const rows = lines.map((line, index) => `<tr><td>${index + 1}. ${escapeHtml(line.vehicle.name || line.vehicle.model || line.vehicle.make)}<small>${escapeHtml(line.vehicle.transmission || '')}</small></td><td>${dateLabel(line.start)} → ${dateLabel(line.end)}</td><td>${line.days}</td><td>${money(line.rate)}</td><td class="number">${money(line.amount)}</td></tr>`).join('');
    const signatureBlock = signature ? `<div class="signature"><b>Pour Rent Car Service</b><img src="${signature}" alt="Signature du loueur"><span>Le loueur</span></div>` : '<div class="signature signature-empty"><b>Pour Rent Car Service</b><span>Signature du loueur</span></div>';
    const printWindow = window.open('', '_blank');
    if (!printWindow) { alert('Autorisez les fenêtres pop-up pour imprimer la facture proforma.'); return; }
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Facture proforma ${escapeHtml(reference)}</title><style>
      *{box-sizing:border-box}body{margin:0;padding:30px;color:#152b3e;font:14px/1.5 Arial,sans-serif}.sheet{max-width:900px;margin:auto}.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #d9a441;padding-bottom:15px}.brand{display:flex;align-items:center;gap:14px}.brand img{width:96px;height:76px;object-fit:contain}.brand h1{margin:0;color:#163d5c;font-size:23px}.brand p{margin:4px 0}.doc-title{text-align:right}.doc-title h2{margin:0;color:#163d5c;font-size:23px}.doc-title p{margin:5px 0}.customer{margin:22px 0;padding:14px 16px;background:#f2f6f9;border-radius:8px}.customer strong{display:inline-block;min-width:78px}table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#163d5c;color:white;text-align:left}th,td{padding:10px 9px;border:1px solid #d5dfe7;vertical-align:top}td small{display:block;color:#5b6d7d}.number{text-align:right;white-space:nowrap}.grand{margin-left:auto;width:min(340px,100%);padding:14px;background:#fff8e7;border:1px solid #e6cf91;border-radius:8px;text-align:right;font-size:20px;font-weight:bold;color:#163d5c}.foot{margin-top:28px;color:#485c6d}.signatures{display:flex;justify-content:space-between;gap:40px;margin-top:50px;min-height:130px}.signature{position:relative;width:45%;min-height:110px}.signature img{display:block;max-width:180px;max-height:75px;object-fit:contain;object-position:left center}.signature span{display:block;border-top:1px solid #7c8b97;margin-top:8px;padding-top:5px}.stamp{position:absolute;right:0;bottom:2px;width:105px;height:105px;object-fit:contain}.signature-empty{padding-top:52px}.screen-only{display:block;margin:24px auto;padding:10px 18px;border:0;border-radius:8px;background:#163d5c;color:white;font-size:15px}@media print{body{padding:0}.sheet{max-width:none}.screen-only{display:none}}@media(max-width:600px){body{padding:12px}.top{gap:8px}.brand img{width:65px;height:58px}.brand h1{font-size:16px}.doc-title h2{font-size:17px}th,td{padding:6px 4px;font-size:11px}.signatures{gap:16px}.stamp{width:75px;height:75px}}
      </style></head><body><main class="sheet"><header class="top"><div class="brand"><img src="${logo}" alt="Logo Rent Car Service"><div><h1>Rent Car Service</h1><p>67 Ha Nord Ouest, Parking FJKM SALEMA<br>034 91 207 26</p></div></div><div class="doc-title"><h2>FACTURE PROFORMA</h2><p><b>Référence :</b> ${escapeHtml(reference)}<br><b>Date :</b> ${dateLabel(issueDate)}</p></div></header><section class="customer"><b>Facturer à</b><br><strong>Client :</strong> ${escapeHtml(clientName)}<br><strong>Téléphone :</strong> ${escapeHtml(clientPhone || '—')}<br><strong>Adresse :</strong> ${escapeHtml(clientAddress || '—')}</section><table><thead><tr><th>Véhicule</th><th>Période de location</th><th>Jours</th><th>Prix / jour</th><th>Total ligne</th></tr></thead><tbody>${rows}</tbody></table><div class="grand">TOTAL : ${money(subtotal)}</div><p class="foot">Cette facture proforma présente une estimation commerciale et ne constitue pas une facture acquittée. La réservation reste soumise à confirmation de disponibilité et aux conditions de location.</p><div class="signatures"><div class="signature"><b>Pour le client</b><span>Nom et signature</span></div>${signatureBlock}<img class="stamp" src="${stamp}" alt="Tampon Rent Car Service"></div><button class="screen-only" onclick="window.print()">Imprimer / enregistrer en PDF</button></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));<\/script></body></html>`;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function init() {
    if (!$('proforma-lines')) return;
    $('proforma-add-line').addEventListener('click', addRow);
    $('proforma-form').addEventListener('submit', event => { event.preventDefault(); createProforma(); });
    $('proforma-issue-date').value = new Date().toISOString().slice(0, 10);
    $('proforma-reference').value = `PF-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const db = window.rentCarSupabase;
    if (!db?.auth) {
      $('proforma-status').textContent = 'Connexion à la base de données indisponible.';
      return;
    }
    db.auth.getSession().then(({ data }) => {
      if (data?.session) loadData();
      else $('proforma-status').textContent = 'Connectez-vous à l’administration pour créer une facture proforma.';
    });
    db.auth.onAuthStateChange((_event, session) => {
      if (session && !state.loaded) loadData();
      if (!session) {
        state.loaded = false;
        state.signature = '';
        state.vehicles = [];
        $('proforma-status').textContent = 'Connectez-vous à l’administration pour créer une facture proforma.';
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
