(function (root) {
  function normalizeFleetLabel(value) {
    return String(value ?? '').trim().toLocaleLowerCase('fr-FR').replace(/\s+/g, ' ');
  }

  function normalizedNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function fleetProfileSignature(vehicle) {
    return JSON.stringify({
      make: normalizeFleetLabel(vehicle.make),
      model: normalizeFleetLabel(vehicle.model),
      transmission: normalizeFleetLabel(vehicle.transmission),
      fuel: normalizeFleetLabel(vehicle.fuel),
      description: normalizeFleetLabel(vehicle.description),
      seats: normalizedNumber(vehicle.seats),
      driver_mode: vehicle.driver_mode || 'without_driver',
      owner_whatsapp_enabled: Boolean(vehicle.owner_whatsapp_enabled),
      owner_phone: String(vehicle.owner_phone || '').replace(/\D/g, ''),
    });
  }

  function stableHash(value) {
    let hash = 2166136261;
    let second = 5381;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
      second = Math.imul(second, 33) ^ value.charCodeAt(index);
    }
    return `${(hash >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
  }

  // Le prix réellement renseigné est conservé : aucune moyenne ni recalcul artificiel.
  function comparisonPrice(vehicle) {
    const daily = normalizedNumber(vehicle.price_per_day);
    const halfDay = normalizedNumber(vehicle.price_12h);
    return daily !== null && daily > 0 ? daily : (halfDay !== null && halfDay > 0 ? halfDay : Infinity);
  }

  function sortByCheapest(units) {
    return units.sort((a, b) => comparisonPrice(a) - comparisonPrice(b)
      || String(a.name || '').localeCompare(String(b.name || ''), 'fr')
      || String(a.id).localeCompare(String(b.id)));
  }

  function groupFleetVehicles(vehicles) {
    const explicitGroups = new Map();
    const independentGroups = [];

    for (const vehicle of vehicles || []) {
      if (!vehicle || !vehicle.id) continue;
      const label = String(vehicle.fleet_group || '').trim();
      if (label) {
        const key = normalizeFleetLabel(label);
        if (!explicitGroups.has(key)) explicitGroups.set(key, { label, units: [] });
        explicitGroups.get(key).units.push(vehicle);
      } else {
        independentGroups.push({ label: '', units: [vehicle], baseKey: `unit:${vehicle.id}` });
      }
    }

    const groups = [];
    for (const [key, base] of explicitGroups) {
      const units = sortByCheapest(base.units);
      const first = units[0];
      groups.push({
        id: `fleet:${key}:${stableHash(key)}`,
        fleet_group: base.label,
        label: base.label,
        displayName: base.label,
        units,
        vehicle: first,
        capacity: units.length,
        profileMismatch: false,
      });
    }

    for (const base of independentGroups) {
      const first = base.units[0];
      const signature = fleetProfileSignature(first);
      groups.push({
        id: `${base.baseKey}:${stableHash(signature)}`,
        fleet_group: null,
        label: first.name || 'Véhicule',
        displayName: first.name || 'Véhicule',
        units: base.units,
        vehicle: first,
        capacity: 1,
        profileMismatch: false,
      });
    }

    return groups.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  }

  function overlaps(start, end, item) {
    return new Date(item.start_at) < new Date(end) && new Date(item.end_at) > new Date(start);
  }

  function contractCoversInterval(vehicle, start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (vehicle.contract_start_date && startDate < new Date(`${vehicle.contract_start_date}T00:00:00`)) return false;
    if (vehicle.contract_end_date && endDate > new Date(`${vehicle.contract_end_date}T23:59:59`)) return false;
    return true;
  }

  function countAvailability(group, start, end, reservations = [], maintenance = []) {
    const availableUnits = (group?.units || []).filter(unit => {
      if (unit.status === 'inactive' || unit.status === 'contract_ended' || unit.status === 'maintenance') return false;
      if (!contractCoversInterval(unit, start, end)) return false;
      const reserved = reservations.some(item => item.vehicle_id === unit.id && item.status !== 'cancelled' && overlaps(start, end, item));
      const blocked = maintenance.some(item => item.vehicle_id === unit.id && overlaps(start, end, item));
      return !reserved && !blocked;
    });
    const totalCount = (group?.units || []).filter(unit => contractCoversInterval(unit, start, end)).length;
    return { totalCount, availableCount: availableUnits.length, availableUnits, isFull: availableUnits.length === 0 };
  }

  const api = { normalizeFleetLabel, fleetProfileSignature, groupFleetVehicles, countAvailability, overlaps, contractCoversInterval, comparisonPrice };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.RentCarFleet = api;
})(typeof window !== 'undefined' ? window : globalThis);
