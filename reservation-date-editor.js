(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const localDateTimeValue = value => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  function ensureStyles() {
    if (document.getElementById('reservation-date-editor-styles')) return;
    const style = document.createElement('style');
    style.id = 'reservation-date-editor-styles';
    style.textContent = '#reservation-date-editor-backdrop{position:fixed;inset:0;z-index:6000;display:flex;align-items:center;justify-content:center;padding:20px;background:#0b1f3388}#reservation-date-editor-backdrop .admin-modal{width:min(760px,100%);max-height:90vh;overflow:auto;padding:24px;border-radius:16px;background:#fff;color:#0b1f33;box-shadow:0 20px 60px #0005}#reservation-date-editor-backdrop .admin-modal h2{margin-top:0}#reservation-date-editor-backdrop .form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}#reservation-date-editor-backdrop .field{margin-bottom:12px}#reservation-date-editor-backdrop .field label{display:block;margin-bottom:6px;font-size:12px;font-weight:700;color:#66788a}#reservation-date-editor-backdrop .field input{width:100%;padding:10px;border:1px solid #dce6ed;border-radius:9px;font:inherit}#reservation-date-editor-backdrop .modal-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}@media(max-width:600px){#reservation-date-editor-backdrop .form-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  window.openReservationDateEditor = function (reservation, { onSaved } = {}) {
    if (!reservation?.id || !['reserved', 'completed'].includes(reservation.status)) {
      alert('Seules les réservations confirmées ou terminées peuvent être modifiées.');
      return;
    }
    ensureStyles();
    document.getElementById('reservation-date-editor-backdrop')?.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'reservation-date-editor-backdrop';
    backdrop.className = 'admin-modal-backdrop';
    backdrop.innerHTML = `<div class="admin-modal" role="dialog" aria-modal="true" aria-labelledby="reservation-date-editor-title">
      <h2 id="reservation-date-editor-title">Modifier les dates de réservation</h2>
      <p><strong>${esc(reservation.reference || 'Réservation')}</strong> — ${esc(reservation.customer_name || 'Client')}</p>
      <form id="reservation-date-editor-form">
        <div class="form-grid">
          <div class="field"><label for="reservation-date-start">Début</label><input id="reservation-date-start" type="datetime-local" required></div>
          <div class="field"><label for="reservation-date-end">Fin</label><input id="reservation-date-end" type="datetime-local" required></div>
        </div>
        <p class="notice">Les conflits de réservation, les maintenances et les dates de contrat seront vérifiés avant l’enregistrement. Le total, les acomptes et les paiements déjà enregistrés ne seront pas recalculés automatiquement : vérifiez-les après modification.</p>
        <p id="reservation-date-editor-status" class="notice" role="status" aria-live="polite" hidden></p>
        <div class="modal-actions"><button type="button" class="btn outline" data-close-reservation-date-editor>Annuler</button><button id="reservation-date-editor-submit" type="submit" class="btn primary">Enregistrer les dates</button></div>
      </form>
    </div>`;
    document.body.appendChild(backdrop);
    const form = backdrop.querySelector('#reservation-date-editor-form');
    const start = backdrop.querySelector('#reservation-date-start');
    const end = backdrop.querySelector('#reservation-date-end');
    const status = backdrop.querySelector('#reservation-date-editor-status');
    const submit = backdrop.querySelector('#reservation-date-editor-submit');
    start.value = localDateTimeValue(reservation.start_at);
    end.value = localDateTimeValue(reservation.end_at);
    backdrop.querySelector('[data-close-reservation-date-editor]').addEventListener('click', () => backdrop.remove());
    backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.remove(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const startDate = new Date(start.value);
      const endDate = new Date(end.value);
      if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
        status.hidden = false;
        status.textContent = 'La date de fin doit être postérieure à la date de début.';
        return;
      }
      submit.disabled = true;
      status.hidden = false;
      status.textContent = 'Vérification et enregistrement…';
      try {
        const { error } = await window.rentCarSupabase.rpc('update_confirmed_reservation_dates', {
          p_reservation_id: reservation.id,
          p_start_at: startDate.toISOString(),
          p_end_at: endDate.toISOString()
        });
        if (error) throw error;
        status.textContent = 'Dates mises à jour. Les montants et paiements sont inchangés.';
        try { await onSaved?.(); } catch (refreshError) { console.error('Reservation dates saved but the view could not refresh:', refreshError); }
        window.setTimeout(() => backdrop.remove(), 500);
      } catch (error) {
        console.error('Reservation date update failed:', error);
        status.textContent = /23P01|overlap|maintenance|reserved/i.test(`${error?.code || ''} ${error?.message || ''}`)
          ? 'Période indisponible : elle chevauche une réservation ou une maintenance.'
          : /mission/i.test(`${error?.code || ''} ${error?.message || ''}`)
            ? 'Ajustez d’abord la mission chauffeur associée pour qu’elle reste dans la nouvelle période.'
          : /23514|contract/i.test(`${error?.code || ''} ${error?.message || ''}`)
            ? 'La période dépasse les dates autorisées du contrat de cette voiture.'
            : `Modification impossible : ${error?.message || 'vérifiez vos droits et les dates.'}`;
      } finally {
        submit.disabled = false;
      }
    });
    start.focus();
  };
})();
