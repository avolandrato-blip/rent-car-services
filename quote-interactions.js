(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const zoneLabel = zone => zone === 'under_150' ? 'Province jusqu’à 150 km de Tana' : zone === 'over_150' ? 'Province au-delà de 150 km de Tana' : 'Tana et environs';

  function findVehicle(id) {
    const groups = window.bookingFleets || window.publicCars || [];
    const selectedGroup = groups.find(item => item?.id === id);
    if (selectedGroup) return selectedGroup.vehicle || selectedGroup.units?.[0] || selectedGroup;
    for (const item of groups) {
      for (const vehicle of item?.units || [item?.vehicle || item]) {
        if (vehicle?.id === id) return vehicle;
      }
    }
    return null;
  }

  function rateFor(vehicle, zone) {
    if (zone === 'city') return Number(vehicle.price_per_day || vehicle.price_12h || 0) || null;
    const mode = vehicle[`province_${zone}_mode`] || 'quote';
    return mode === 'price' && Number(vehicle[`province_${zone}_price`] || 0) > 0 ? Number(vehicle[`province_${zone}_price`]) : null;
  }

  function addStyles() {
    if (document.getElementById('public-quote-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'public-quote-modal-styles';
    style.textContent = `
      .public-quote-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(8,24,39,.76);overflow-y:auto}
      .public-quote-modal{width:min(700px,100%);max-height:92vh;overflow-y:auto;background:#fff;color:#0b1f33;border:1px solid #d9e2ea;border-radius:18px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.28);font-family:Arial,sans-serif}
      .public-quote-modal h2{font-size:24px;margin:0 40px 14px 0;color:#0b1f33}
      .public-quote-modal p{line-height:1.5}.public-quote-modal .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .public-quote-modal .field{min-width:0}.public-quote-modal .field.full{grid-column:1/-1}
      .public-quote-modal .field label{display:block;font-size:13px;font-weight:700;margin-bottom:5px;color:#536779}
      .public-quote-modal input,.public-quote-modal select{width:100%;min-height:42px;padding:9px 10px;border:1px solid #cdd8e2;border-radius:9px;background:#fff;color:#0b1f33;font:inherit}
      .public-quote-modal .modal-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:16px}
      .public-quote-modal .public-quote-status{padding:10px 12px;border-radius:9px;background:#eef5fa;color:#0d5c8f}
      .public-quote-modal .public-quote-status.error{background:#fff1f0;color:#b42318}
      .public-quote-modal .public-quote-close{float:right;border:0;background:#eef3f7;border-radius:50%;width:36px;height:36px;font-size:20px;cursor:pointer;color:#0b1f33}
      @media(max-width:560px){.public-quote-modal{padding:18px}.public-quote-modal .form-grid{grid-template-columns:1fr}.public-quote-modal .field.full{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function printQuote(quote, printTab) {
    const total = quote.total_amount ? `${Number(quote.total_amount).toLocaleString('fr-FR')} Ar` : 'Sur devis';
    const whatsappLink = quote.whatsappUrl
      ? `<p class="screen-only"><a href="${esc(quote.whatsappUrl)}" target="_blank" rel="noopener">Transmettre la demande à Rent Car Service par WhatsApp</a></p>`
      : '';
    const html = `<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Devis ${esc(quote.reference)}</title><style>body{font:14px Arial,sans-serif;line-height:1.5;padding:35px;max-width:820px;margin:auto;color:#0b1f33}h1{text-align:center;color:#0d5c8f}.box{border:1px solid #ccd5dd;border-radius:8px;padding:14px;margin:14px 0}.total{font-size:20px;font-weight:bold;color:#a7700d}.sign{display:flex;justify-content:space-between;margin-top:70px}.screen-only{text-align:center;margin:24px}.screen-only a{display:inline-block;padding:12px 16px;background:#16803c;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold}@media print{.screen-only{display:none}}</style></head><body><h1>Rent Car Service</h1><p>67 Ha Nord Ouest, Parking FJKM SALEMA<br>034 91 207 26</p><h2>DEVIS / FACTURE PRO FORMA</h2><p><strong>Référence :</strong> ${esc(quote.reference)}<br><strong>Fait à Antananarivo, le :</strong> ${new Date().toLocaleDateString('fr-FR')}</p><div class="box"><strong>Client :</strong> ${esc(quote.customer_name)} ${esc(quote.customer_first_name)}<br><strong>WhatsApp :</strong> ${esc(quote.whatsapp_phone)}<br><strong>Adresse :</strong> ${esc(quote.customer_address)}</div><div class="box"><strong>Véhicule :</strong> ${esc(quote.vehicle.name || quote.vehicle.nom)}<br><strong>Période :</strong> ${new Date(quote.start_at).toLocaleString('fr-FR')} → ${new Date(quote.end_at).toLocaleString('fr-FR')}<br><strong>Zone :</strong> ${esc(zoneLabel(quote.zone))}<br><strong>Durée :</strong> ${quote.days} jour(s)}</div><p class="total">Total estimatif : ${total}</p><p>Après accord du client et validation par Rent Car Service, ce devis peut être converti en réservation et faire l’objet d’un contrat de location.</p>${whatsappLink}<div class="sign"><span>CLIENT<br><br>Signature :</span><span>RENT CAR SERVICE<br><br>Signature :</span></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),200));<\/script></body></html>`;
    printTab.document.open();
    printTab.document.write(html);
    printTab.document.close();
  }

  function openQuoteForVehicle(id) {
    const vehicle = findVehicle(id);
    if (!vehicle) {
      alert('Impossible de retrouver ce véhicule. Actualisez la page puis réessayez.');
      return;
    }
    addStyles();
    document.getElementById('public-quote-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `<div id="public-quote-modal" class="public-quote-backdrop"><section class="public-quote-modal" role="dialog" aria-modal="true" aria-labelledby="public-quote-title"><button type="button" class="public-quote-close" id="public-quote-close-x" aria-label="Fermer">×</button><h2 id="public-quote-title">Demander un devis</h2><p><strong>Véhicule :</strong> ${esc(vehicle.name || vehicle.nom)}<br><span id="public-quote-price-note">Choisissez la zone et les dates.</span></p><form id="public-quote-form"><div class="form-grid"><div class="field"><label for="public-quote-start-date">Date de départ *</label><input id="public-quote-start-date" type="date" required></div><div class="field"><label for="public-quote-end-date">Date de retour *</label><input id="public-quote-end-date" type="date" required></div><div class="field"><label for="public-quote-start-time">Heure de départ *</label><input id="public-quote-start-time" type="time" value="07:00" required></div><div class="field"><label for="public-quote-end-time">Heure de retour *</label><input id="public-quote-end-time" type="time" value="18:00" required></div><div class="field"><label for="public-quote-name">Nom *</label><input id="public-quote-name" required autocomplete="family-name"></div><div class="field"><label for="public-quote-first-name">Prénom</label><input id="public-quote-first-name" autocomplete="given-name"></div><div class="field"><label for="public-quote-whatsapp">Numéro WhatsApp *</label><input id="public-quote-whatsapp" type="tel" required placeholder="034 91 207 26" autocomplete="tel"></div><div class="field full"><label for="public-quote-address">Adresse *</label><input id="public-quote-address" required autocomplete="street-address"></div><div class="field full"><label for="public-quote-zone">Zone souhaitée *</label><select id="public-quote-zone"><option value="city">Tana et environs</option><option value="under_150">Province jusqu’à 150 km de Tana</option><option value="over_150">Province au-delà de 150 km de Tana</option></select></div></div><p id="public-quote-total" class="public-quote-status" role="status" aria-live="polite"></p><p id="public-quote-result" class="public-quote-status error" role="status" aria-live="polite" hidden></p><div class="modal-actions"><button type="button" class="btn btn-outline" id="public-quote-cancel">Annuler</button><button type="submit" class="btn btn-primary" id="public-quote-submit">Générer le devis</button></div></form></section></div>`);

    const modal = document.getElementById('public-quote-modal');
    const form = document.getElementById('public-quote-form');
    const startDate = document.getElementById('public-quote-start-date');
    const endDate = document.getElementById('public-quote-end-date');
    const startTime = document.getElementById('public-quote-start-time');
    const endTime = document.getElementById('public-quote-end-time');
    const zoneSelect = document.getElementById('public-quote-zone');
    const resultBox = document.getElementById('public-quote-result');
    const submitButton = document.getElementById('public-quote-submit');
    const close = () => modal.remove();

    const refresh = () => {
      const zone = zoneSelect.value;
      const rate = rateFor(vehicle, zone);
      const start = startDate.value && startTime.value ? new Date(`${startDate.value}T${startTime.value}`) : null;
      const end = endDate.value && endTime.value ? new Date(`${endDate.value}T${endTime.value}`) : null;
      const validPeriod = Boolean(start && end && Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end > start);
      const days = validPeriod ? Math.max(1, Math.ceil((end - start) / 86400000)) : 0;
      const unavailable = zone !== 'city' && vehicle[`province_${zone}_mode`] === 'unavailable';
      document.getElementById('public-quote-price-note').textContent = `${zoneLabel(zone)} — ${unavailable ? 'Non disponible' : rate ? `${rate.toLocaleString('fr-FR')} Ar / jour` : 'Sur devis'}`;
      const total = document.getElementById('public-quote-total');
      total.textContent = unavailable
        ? 'Cette zone n’est pas disponible pour ce véhicule.'
        : days ? (rate ? `Total estimatif : ${(rate * days).toLocaleString('fr-FR')} Ar (${days} jour(s))` : `Durée estimée : ${days} jour(s) — total sur devis`)
          : 'Renseignez des dates et heures valides pour calculer la durée.';
      return { zone, rate, days, unavailable, validPeriod, start, end };
    };

    [startDate, endDate, startTime, endTime, zoneSelect].forEach(input => input.addEventListener('input', refresh));
    document.getElementById('public-quote-cancel').addEventListener('click', close);
    document.getElementById('public-quote-close-x').addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    refresh();

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const quote = refresh();
      if (quote.unavailable || !quote.validPeriod || !quote.days) {
        resultBox.hidden = false;
        resultBox.textContent = quote.unavailable ? 'Cette zone n’est pas disponible pour ce véhicule.' : 'Vérifiez les dates et heures de départ et de retour.';
        return;
      }
      if (!window.rentCarSupabase) {
        resultBox.hidden = false;
        resultBox.textContent = 'Le service de devis est momentanément indisponible. Réessayez ou contactez-nous par WhatsApp.';
        return;
      }
      const printTab = window.open('', '_blank');
      if (!printTab) {
        resultBox.hidden = false;
        resultBox.textContent = 'Autorisez les fenêtres pop-up pour ouvrir le devis imprimable, puis réessayez.';
        return;
      }
      printTab.document.write('<p style="font:16px Arial;padding:30px">Préparation du devis…</p>');
      submitButton.disabled = true;
      submitButton.textContent = 'Enregistrement…';
      resultBox.hidden = true;
      const payload = {
        vehicle_id: vehicle.id,
        start_at: quote.start.toISOString(),
        end_at: quote.end.toISOString(),
        customer_name: document.getElementById('public-quote-name').value.trim(),
        customer_first_name: document.getElementById('public-quote-first-name').value.trim(),
        whatsapp_phone: document.getElementById('public-quote-whatsapp').value.trim(),
        customer_address: document.getElementById('public-quote-address').value.trim(),
        zone: quote.zone,
        daily_rate: quote.rate,
        days: quote.days,
        total_amount: quote.rate ? quote.rate * quote.days : null
      };
      try {
        const response = await window.rentCarSupabase.rpc('create_public_quote', { p_payload: payload });
        if (response.error) throw new Error(response.error.message || 'Erreur lors de la création du devis.');
        const row = Array.isArray(response.data) ? response.data[0] : response.data;
        if (!row?.reference) throw new Error('Le devis n’a pas pu être enregistré.');
        const config = typeof siteConfig !== 'undefined' ? siteConfig : {};
        const target = String(config.footer?.whatsapp || config.footer?.telephone || '').replace(/\D/g, '');
        const whatsappUrl = target ? `https://wa.me/${target}?text=${encodeURIComponent(`Rent Car Service — Demande de devis ${row.reference}. Client : ${payload.customer_name}.`)}` : '';
        printQuote({ ...payload, reference: row.reference, vehicle, whatsappUrl }, printTab);
        modal.remove();
      } catch (error) {
        printTab.close();
        resultBox.hidden = false;
        resultBox.textContent = `Le devis n’a pas pu être créé : ${error.message || 'erreur inconnue'}. Vous pouvez réessayer ou nous contacter par WhatsApp.`;
        submitButton.disabled = false;
        submitButton.textContent = 'Réessayer';
        console.error('Quote generation failed:', error);
      }
    });
  }

  window.openQuoteForVehicle = openQuoteForVehicle;
})();
