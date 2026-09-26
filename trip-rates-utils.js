(function (root) {
  function labelFor(rate) {
    return String(rate?.label || [rate?.from, rate?.to].filter(Boolean).join(' → ') || 'Destination spéciale').trim();
  }

  function slugFor(value) {
    return String(value ?? '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function idFor(rate, index = 0) {
    return String(rate?.id || slugFor(labelFor(rate)) || `destination-${index + 1}`);
  }

  function amountFor(rate) {
    const amount = Number(rate?.rate ?? rate?.price_per_day ?? 0);
    return Number.isFinite(amount) ? amount : 0;
  }

  function normalize(rate, index = 0) {
    return {
      ...rate,
      id: idFor(rate, index),
      label: labelFor(rate),
      rate: amountFor(rate),
    };
  }

  /**
   * Merge edited routes over the latest saved array. Routes omitted from the
   * form are retained; only IDs explicitly removed by the user are deleted.
   */
  function merge(savedRates, editedRates, removedIds = []) {
    const removed = new Set(Array.from(removedIds, value => String(value)));
    const edits = (Array.isArray(editedRates) ? editedRates : []).map(normalize);
    const editsById = new Map(edits.map(route => [route.id, route]));
    const seen = new Set();
    const merged = [];

    (Array.isArray(savedRates) ? savedRates : []).forEach((saved, index) => {
      const savedRoute = normalize(saved, index);
      if (removed.has(savedRoute.id)) return;
      const edit = editsById.get(savedRoute.id);
      merged.push(edit ? { ...savedRoute, ...edit, id: savedRoute.id } : savedRoute);
      seen.add(savedRoute.id);
    });

    edits.forEach(route => {
      if (!seen.has(route.id) && !removed.has(route.id)) {
        merged.push(route);
        seen.add(route.id);
      }
    });

    return merged;
  }

  const api = { labelFor, slugFor, idFor, amountFor, normalize, merge };
  root.RentCarTripRates = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
