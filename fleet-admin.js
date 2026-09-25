(() => {
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const fleet = window.RentCarFleet;
  if (!fleet) return;

  function activeGroups() {
    const units = (typeof vehicles !== 'undefined' ? vehicles : []).filter(vehicle => vehicle.status !== 'contract_ended');
    return fleet.groupFleetVehicles(units);
  }

  function localSlot(date, startHour, endHour, nextDay = false) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), startHour);
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + (nextDay ? 1 : 0), endHour);
    return { start, end };
  }

  function availability(group, start, end) {
    const result = fleet.countAvailability(group, start.toISOString(), end.toISOString(), reservations, maintenances);
    const maintenanceCount = group.units.filter(unit => maintenances.some(item => item.vehicle_id === unit.id && start < new Date(item.end_at) && end > new Date(item.start_at))).length;
    return { ...result, maintenanceCount };
  }

  function statusLabel(result) {
    if (result.availableCount === 0) return result.maintenanceCount ? `Complet · ${result.maintenanceCount} en maintenance` : 'Complet';
    return `${result.availableCount}/${result.totalCount} disponible${result.availableCount > 1 ? 's' : ''}`;
  }

  function slotMarkup(label, result) {
    const full = result.availableCount === 0;
    const partial = !full && result.availableCount < result.totalCount;
    const maintenanceOnly = full && result.maintenanceCount > 0;
    const color = maintenanceOnly ? ['#fff0bf', '#805c00'] : full ? ['#ffe2df', '#8b1e18'] : partial ? ['#fff4cc', '#8a6000'] : ['#dff7e8', '#166534'];
    return `<span class="calendar-event ${full ? 'calendar-full' : partial ? 'calendar-partial' : 'calendar-available'}" style="background:${color[0]};color:${color[1]}">${label}: ${esc(statusLabel(result))}</span>`;
  }

  function updateCalendarFilter() {
    const select = $('calendar-vehicle');
    if (!select) return;
    const previous = select.value;
    const groups = activeGroups();
    select.innerHTML = '<option value="all">Toutes les flottes</option>' + groups.map(group => `<option value="${esc(group.id)}">${esc(group.displayName)} (${group.capacity})</option>`).join('');
    select.value = groups.some(group => group.id === previous) ? previous : 'all';
  }

  function renderCalendar() {
    const target = $('calendar');
    if (!target || typeof reservations === 'undefined' || typeof maintenances === 'undefined') return;
    const month = $('calendar-month')?.value || new Date().toISOString().slice(0, 7);
    const selected = $('calendar-vehicle')?.value || 'all';
    const first = new Date(`${month}-01T00:00:00`);
    if (!Number.isFinite(first.getTime())) return;
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const groups = activeGroups().filter(group => selected === 'all' || group.id === selected);
    target.innerHTML = groups.map(group => {
      const dayCards = Array.from({ length: days }, (_, index) => {
        const date = new Date(first.getFullYear(), first.getMonth(), index + 1);
        const day = localSlot(date, 7, 19);
        const night = localSlot(date, 19, 7, true);
        return `<div class="calendar-day"><strong>${index + 1}</strong>${slotMarkup('07h–19h', availability(group, day.start, day.end))}${slotMarkup('19h–07h', availability(group, night.start, night.end))}</div>`;
      }).join('');
      return `<div class="card" style="margin-bottom:14px"><strong>${esc(group.displayName)}</strong><small style="display:block;margin:4px 0 10px">${group.capacity} voiture(s) dans cette flotte${group.profileMismatch ? ' · fiches aux conditions différentes séparées' : ''}</small><div class="calendar-grid">${dayCards}</div></div>`;
    }).join('') || '<div class="empty">Aucune flotte à afficher.</div>';
  }

  window.renderCalendar = renderCalendar;
  window.renderFleetCalendar = renderCalendar;
  window.updateFleetCalendarFilter = updateCalendarFilter;

  const originalRefreshAll = window.refreshAll;
  if (typeof originalRefreshAll === 'function' && !originalRefreshAll.__fleetWrapped) {
    const wrappedRefreshAll = async function (...args) {
      const result = await originalRefreshAll.apply(this, args);
      updateCalendarFilter();
      renderCalendar();
      return result;
    };
    wrappedRefreshAll.__fleetWrapped = true;
    window.refreshAll = wrappedRefreshAll;
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('calendar-month')?.addEventListener('change', renderCalendar);
    $('calendar-vehicle')?.addEventListener('change', renderCalendar);
    $('vehicle-form')?.addEventListener('submit', () => setTimeout(() => { updateCalendarFilter(); renderCalendar(); }, 0), true);
    if ($('app-view') && !$('app-view').classList.contains('hidden')) {
      updateCalendarFilter();
      renderCalendar();
    }
  });
})();
