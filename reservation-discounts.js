(() => {
  const money = value => `${Math.round(Number(value || 0)).toLocaleString('fr-FR')} Ar`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const db = () => window.rentCarSupabase;

  function open(row, afterSave) {
    if (!row || !db()) return;
    document.getElementById('reservation-discount-dialog')?.remove();
    const basis = Math.max(0, Number(row.total_amount || 0) + Number(row.manual_discount_amount || 0));
    const currentType = row.manual_discount_type === 'percent' ? 'percent' : 'amount';
    const currentValue = Number(row.manual_discount_value || 0);
    document.body.insertAdjacentHTML('beforeend', `<dialog id="reservation-discount-dialog" style="width:min(480px,calc(100vw - 24px));border:0;border-radius:16px;padding:24px;color:#0b1f33;box-shadow:0 20px 70px #0005"><form id="reservation-discount-form"><h2 style="margin-top:0">Remise — ${esc(row.reference || 'Réservation')}</h2><p>Montant avant remise manuelle : <strong>${money(basis)}</strong></p><label style="display:block;margin:12px 0 5px;font-weight:700">Type de remise<select id="reservation-discount-type" style="display:block;width:100%;padding:10px;margin-top:5px"><option value="amount" ${currentType==='amount'?'selected':''}>Montant fixe (Ar)</option><option value="percent" ${currentType==='percent'?'selected':''}>Pourcentage (%)</option></select></label><label style="display:block;margin:12px 0 5px;font-weight:700">Valeur<input id="reservation-discount-value" type="number" min="0" max="${currentType==='percent'?'100':basis}" step="${currentType==='percent'?'0.01':'1'}" value="${currentValue}" style="display:block;width:100%;padding:10px;margin-top:5px" required></label><p id="reservation-discount-preview" aria-live="polite"></p><p class="muted">La remise s’applique à cette réservation. Le total ne peut pas être inférieur aux sommes déjà payées.</p><div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px"><button type="button" class="btn outline" id="reservation-discount-cancel">Annuler</button><button type="submit" class="btn primary">Enregistrer la remise</button></div></form></dialog>`);
    const dialog = document.getElementById('reservation-discount-dialog');
    const form = document.getElementById('reservation-discount-form');
    const typeInput = document.getElementById('reservation-discount-type');
    const valueInput = document.getElementById('reservation-discount-value');
    const preview = document.getElementById('reservation-discount-preview');
    const updatePreview = () => {
      const type = typeInput.value, value = Number(valueInput.value || 0);
      valueInput.max = type === 'percent' ? '100' : String(basis);
      valueInput.step = type === 'percent' ? '0.01' : '1';
      const discount = Math.round(type === 'percent' ? basis * value / 100 : value);
      preview.textContent = `Remise : ${money(discount)} · Nouveau total : ${money(Math.max(0, basis-discount))}`;
    };
    typeInput.addEventListener('change', updatePreview);
    valueInput.addEventListener('input', updatePreview);
    updatePreview();
    document.getElementById('reservation-discount-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove(), {once:true});
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const value = Number(valueInput.value), type = typeInput.value;
      if (!Number.isFinite(value) || value < 0 || (type === 'percent' && value > 100) || (type === 'amount' && value > basis)) {
        valueInput.setCustomValidity('Valeur de remise invalide.'); valueInput.reportValidity(); return;
      }
      valueInput.setCustomValidity('');
      const button = form.querySelector('[type="submit"]'); button.disabled = true;
      try {
        const {error} = await db().rpc('apply_reservation_discount', {p_reservation_id:row.id,p_discount_type:type,p_discount_value:value});
        if (error) throw error;
        dialog.close();
        await afterSave?.();
        window.alert('Remise enregistrée.');
      } catch (error) {
        window.alert(`Remise non enregistrée : ${error?.message || error}`);
      } finally { button.disabled = false; }
    });
    dialog.showModal();
  }

  window.RentCarDiscountDialog = {open};
})();
