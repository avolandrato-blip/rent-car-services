(function (root) {
  'use strict';

  const TEMPLATE_KEY = 'rijaniaina_v1';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const money = value => `${Math.round(Number(value || 0)).toLocaleString('fr-FR')} Ariary`;

  function templateForFirstName(firstName) {
    return ['rijaniaina', 'rija niaina'].includes(normalize(firstName)) ? TEMPLATE_KEY : '';
  }

  function dateTime(value) {
    if (!value) return '________________';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '________________';
    return new Intl.DateTimeFormat('fr-FR', { timeZone: 'Indian/Antananarivo', dateStyle: 'short', timeStyle: 'short' }).format(date);
  }

  function safeText(value, fallback = '') {
    const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
    return text || fallback;
  }

  function field(x, y, value, options = {}) {
    const text = safeText(value, '');
    if (!text) return '';
    const size = options.size || 8;
    const maxWidth = options.maxWidth ? `max-width:${(options.maxWidth / 612 * 100).toFixed(3)}%;` : '';
    const align = options.align || 'left';
    return `<span class="partner-contract-field" style="left:${(x / 612 * 100).toFixed(3)}%;top:${(y / 792 * 100).toFixed(3)}%;font-size:${size}pt;text-align:${align};${maxWidth}">${esc(text)}</span>`;
  }

  function periodsFor(reservation, groupedRows) {
    const rows = Array.isArray(groupedRows) && groupedRows.length ? groupedRows : [reservation];
    return rows.filter(Boolean).slice().sort((a, b) => Date.parse(a.start_at || '') - Date.parse(b.start_at || ''));
  }

  function renderHtml(templateKey, reservation, vehicle = {}, groupedRows = [], options = {}) {
    if (templateKey !== TEMPLATE_KEY) throw new Error('Modèle de contrat partenaire inconnu.');
    const rows = periodsFor(reservation || {}, groupedRows);
    const first = rows[0] || reservation || {};
    const last = rows[rows.length - 1] || reservation || {};
    const totalDays = rows.reduce((sum, row) => sum + (Number(row.days) || 0), 0) || rows.length || 1;
    const totalAmount = rows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0);
    const rates = [...new Set(rows.map(row => Number(row.daily_rate || 0)).filter(rate => rate > 0))];
    const dailyRate = rates.length > 1 ? 'Voir le détail de l’annexe' : (rates.length ? money(rates[0]) : '');
    const name = safeText(reservation?.customer_name);
    const address = safeText(reservation?.customer_address);
    const cin = safeText(reservation?.customer_cin);
    const cinIssueDate = safeText(reservation?.cin_acquired_at);
    const cinIssuePlace = safeText(reservation?.cin_acquired_place);
    const license = safeText(reservation?.customer_license);
    const licensePlace = safeText(reservation?.license_acquired_place);
    const licenseDate = safeText(reservation?.license_acquired_at);
    const phone = safeText(reservation?.customer_phone);
    const startText = rows.length > 1 ? dateTime(first.start_at) : dateTime(reservation?.start_at || first.start_at);
    const endText = rows.length > 1 ? dateTime(first.end_at) : dateTime(reservation?.end_at || last.end_at);
    const vehicleMake = safeText(vehicle.make);
    const vehicleModel = safeText(vehicle.model || vehicle.name);
    const vehicleType = safeText(vehicle.description, reservation?.with_driver ? 'Voiture de tourisme avec chauffeur' : 'Voiture de tourisme sans chauffeur');
    const plate = safeText(vehicle.registration_number);
    const clientSignature = /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(String(options.clientSignatureDataUrl || '')) ? String(options.clientSignatureDataUrl) : '';
    const pageUrls = Array.isArray(options.pageUrls) ? options.pageUrls : [];
    if (pageUrls.length !== 4 || pageUrls.some(url => {
      try { const parsed = new URL(String(url)); return parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co') || !parsed.pathname.includes('/storage/v1/object/sign/partner-contract-templates/'); }
      catch { return true; }
    })) throw new Error('Les pages du modèle privé ne sont pas disponibles.');
    const pages = [1, 2, 3, 4].map(number => {
      let overlays = '';
      if (number === 1) {
        overlays += field(168, 300, name, { size: 8.4, maxWidth: 330 });
        overlays += field(143, 314, address, { size: 7.5, maxWidth: 265 });
        overlays += field(130, 339.5, cin, { size: 7.4, maxWidth: 120 });
        overlays += field(260, 339.5, cinIssueDate, { size: 7.2, maxWidth: 90 });
        overlays += field(367, 339.5, cinIssuePlace, { size: 7.2, maxWidth: 86 });
        if (reservation?.cin_is_duplicate) overlays += field(94, 352.5, 'DUPLICATA', { size: 7.5, maxWidth: 150 });
        overlays += field(250, 365.5, license, { size: 7.4, maxWidth: 240 });
        overlays += field(150, 378.5, licensePlace, { size: 7.2, maxWidth: 145 });
        overlays += field(311, 378.5, licenseDate, { size: 7.2, maxWidth: 150 });
        overlays += field(98, 391.5, phone, { size: 7.5, maxWidth: 150 });
        overlays += field(140, 538.5, vehicleMake, { size: 8, maxWidth: 300 });
        overlays += field(139, 553.5, vehicleModel, { size: 8, maxWidth: 300 });
        overlays += field(126, 568.5, vehicleType, { size: 7.7, maxWidth: 360 });
        overlays += field(230, 593.2, plate, { size: 8, maxWidth: 270 });
        overlays += field(135, 680.8, startText, { size: 7.7, maxWidth: 375 });
        overlays += field(135, 695.7, endText, { size: 7.7, maxWidth: 375 });
      }
      if (number === 2) {
        overlays += field(302, 120.2, dailyRate, { size: 7.7, maxWidth: 210 });
        overlays += field(305, 135.1, String(totalDays), { size: 8, maxWidth: 140 });
        overlays += field(275, 105.4, money(totalAmount), { size: 8, maxWidth: 240 });
      }
      if (number === 4) {
        overlays += field(328, 234.8, 'Antananarivo', { size: 8, maxWidth: 85 });
        overlays += field(444, 234.8, new Date().toLocaleDateString('fr-FR'), { size: 8, maxWidth: 90 });
        overlays += `<div class="partner-contract-signature-slot client-document-signature-slot" data-client-signature-slot="contract" aria-label="Signature du locataire">${clientSignature ? `<img src="${esc(clientSignature)}" alt="Signature du locataire">` : ''}</div>`;
      }
      return `<section class="partner-contract-page"><img src="${esc(pageUrls[number - 1])}" alt="Page ${number} du modèle de contrat Rijaniaina">${overlays}</section>`;
    }).join('');
    const appendix = rows.length > 1 ? `<section class="partner-contract-appendix"><header><h1>ANNEXE — PÉRIODES DE LOCATION</h1><p>Référence : ${esc(reservation?.reference || '—')} · Locataire : ${esc(name || '—')}</p><p>Les clauses du contrat original restent inchangées. Cette annexe détaille les périodes enregistrées pour la réservation groupée.</p></header><table><thead><tr><th>Période</th><th>Début</th><th>Fin</th><th>Jours</th><th>Tarif/jour</th><th>Montant</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(dateTime(row.start_at))}</td><td>${esc(dateTime(row.end_at))}</td><td>${Number(row.days || 0) || 1}</td><td>${esc(money(row.daily_rate))}</td><td>${esc(money(row.total_amount))}</td></tr>`).join('')}<tr class="total"><td colspan="3">Total</td><td>${totalDays}</td><td></td><td>${esc(money(totalAmount))}</td></tr></tbody></table><p>Fait à Antananarivo, le ${esc(new Date().toLocaleDateString('fr-FR'))}.</p></section>` : '';
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Contrat ${esc(reservation?.reference || '')}</title><style>@page{size:letter;margin:0}html,body{margin:0;padding:0;background:#fff}.partner-contract-page{position:relative;width:8.5in;height:11in;margin:0 auto;overflow:hidden;page-break-after:always;break-after:page}.partner-contract-page>img{position:absolute;inset:0;width:100%;height:100%;object-fit:fill}.partner-contract-field{position:absolute;display:block;overflow:hidden;white-space:nowrap;line-height:1;font-family:Arial,Helvetica,sans-serif;font-weight:400;color:#111;box-sizing:border-box}.partner-contract-signature-slot{position:absolute;left:14.7%;top:47.5%;width:34%;height:10%;border-bottom:1px solid #333;box-sizing:border-box;background:rgba(255,255,255,.82);display:flex;align-items:flex-end;justify-content:center;font:8pt Arial;color:#111}.partner-contract-signature-slot::after{content:'Signature du Locataire';padding-bottom:2px}.partner-contract-signature-slot img{max-width:100%;max-height:100%;object-fit:contain}.partner-contract-appendix{box-sizing:border-box;width:8.5in;min-height:11in;padding:.55in .65in;font:10pt/1.4 Arial,Helvetica,sans-serif;color:#182b38;page-break-before:always;break-before:page}.partner-contract-appendix h1{text-align:center;font-size:16pt;margin:0 0 14pt;color:#0b2b42}.partner-contract-appendix table{width:100%;border-collapse:collapse;margin:20pt 0}.partner-contract-appendix th,.partner-contract-appendix td{border:1px solid #758391;padding:7pt 5pt;text-align:left}.partner-contract-appendix th{background:#e9eff4}.partner-contract-appendix .total{font-weight:bold;background:#f2f5f7}.partner-contract-appendix p{margin:8pt 0}.partner-contract-appendix header{border-bottom:2px solid #c7a74a;padding-bottom:8pt}@media print{.partner-contract-appendix{page-break-before:always;break-before:page}}@media screen{.partner-contract-page,.partner-contract-appendix{box-shadow:0 1px 8px #777;margin:12px auto}} </style></head><body>${pages}${appendix}<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),350));<\/script></body></html>`;
  }

  const api = { TEMPLATE_KEY, templateForFirstName, renderHtml, dateTime, money };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.RentCarPartnerContracts = api;
})(typeof window !== 'undefined' ? window : null);
