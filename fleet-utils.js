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
    const routes = (Array.isArray(vehicle.trip_rates) ? vehicle.trip_rates : [])
      .map(route => ({
        label: normalizeFleetLabel(route.label || [route.from, route.to].filter(Boolean).join(' → ')),
        rate: normalizedNumber(route.rate ?? route.price_per_day),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr') || (a.rate ?? 0) - (b.rate ?? 0));
    return JSON.stringify({
      make: normalizeFleetLabel(vehicle.make),
      model: normalizeFleetLabel(vehicle.model),
      transmission: normalizeFleetLabel(vehicle.transmission),
      fuel: normalizeFleetLabel(vehicle.fuel),
      description: normalizeFleetLabel(vehicle.description),
      seats: normalizedNumber(vehicle.seats),
      driver_mode: vehicle.driver_mode || 'without_driver',
      price_12h: normalizedNumber(vehicle.price_12h),
      price_24h: normalizedNumber(vehicle.price_24h),
      price_per_day: normalizedNumber(vehicle.price_per_day),
      driver_fee: normalizedNumber(vehicle.driver_fee),
      extra_driver_fee: normalizedNumber(vehicle.extra_driver_fee),
      trip_rates: routes,
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

  function groupFleetVehicles(vehicles) {
    const byBase = new Map();
    for (const vehicle of vehicles || []) {
      if (!vehicle || !vehicle.id) continue;
      const label = String(vehicle.fleet_group || '').trim();
      const baseKey = label ? `fleet:${normalizeFleetLabel(label)}` : `unit:${vehicle.id}`;
      if (!byBase.has(baseKey)) byBase.set(baseKey, { label, profiles: new Map() });
      const base = byBase.get(baseKey);
      const signature = fleetProfileSignature(vehicle);
      if (!base.profiles.has(signature)) base.profiles.set(signature, []);
      base.profiles.get(signature).push(vehicle);
    }

    const groups = [];
    for (const [baseKey, base] of byBase) {
      const profileMismatch = base.profiles.size > 1;
      for (const [signature, units] of base.profiles) {
        units.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'fr'));
        const first = units[0];
        const groupLabel = base.label || first.name || 'Véhicule';
        const profileHash = stableHash(signature);
        const displayName = profileMismatch ? `${groupLabel} — ${first.name || 'conditions spécifiques'}` : groupLabel;
        groups.push({
          id: `${baseKey}:${profileHash}`,
          fleet_group: base.label || null,
          label: displayName,
          displayName,
          units,
          vehicle: first,
          capacity: units.length,
          profileMismatch,
        });
      }
    }
    return groups.sort((a, b) => a.displayName.localeCompare(b.displayName, 'fr'));
  }

  function overlaps(start, end, item) {
    return new Date(item.start_at) < new Date(end) && new Date(item.end_at) > new Date(start);
  }

  function contractCoversInterval(vehicle, start, end) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const firstRentalDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const lastRentalDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    if (vehicle.contract_start_date && firstRentalDate < new Date(`${vehicle.contract_start_date}T00:00:00`)) return false;
    if (vehicle.contract_end_date && lastRentalDate > new Date(`${vehicle.contract_end_date}T00:00:00`)) return false;
    return vehicle.status !== 'contract_ended';
  }

  function availableUnitsForGroup(group, start, end, reservations, maintenance) {
    if (!group || !start || !end || new Date(end) <= new Date(start)) return [];
    const activeReservations = (reservations || []).filter(item => ['pre_reserved', 'reserved'].includes(item.status));
    const blockedMaintenance = maintenance || [];
    return group.units.filter(unit => contractCoversInterval(unit, start, end) && unit.status === 'available' &&
      !activeReservations.some(item => item.vehicle_id === unit.id && overlaps(start, end, item)) &&
      !blockedMaintenance.some(item => item.vehicle_id === unit.id && overlaps(start, end, item)));
  }

  function countAvailability(group, start, end, reservations, maintenance) {
    const availableUnits = availableUnitsForGroup(group, start, end, reservations, maintenance);
    const totalCount = (group?.units || []).filter(unit => contractCoversInterval(unit, start, end)).length;
    return { availableUnits, availableCount: availableUnits.length, totalCount, isFull: availableUnits.length === 0 };
  }

  const api = { normalizeFleetLabel, fleetProfileSignature, groupFleetVehicles, availableUnitsForGroup, countAvailability, contractCoversInterval };
  root.RentCarFleet = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
