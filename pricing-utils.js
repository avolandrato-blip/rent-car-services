(function (root) {
  function calculateRental(rate12h, rate24h, hours, tripRatePerDay = null) {
    const rate12 = Number(rate12h || 0);
    const parsedRate24 = rate24h === null || rate24h === undefined || rate24h === ''
      ? null
      : Number(rate24h);
    const rate24 = Number.isFinite(parsedRate24) && parsedRate24 > 0 ? parsedRate24 : null;
    const durationHours = Number(hours);
    const days = Math.max(1, Math.ceil(durationHours / 24));
    const billedHours = Math.max(1, Math.ceil(durationHours));
    const routeRate = Number(tripRatePerDay || 0);
    const hasTripRate = Number.isFinite(routeRate) && routeRate > 0;

    if (!Number.isFinite(durationHours) || durationHours <= 0 || rate12 <= 0) {
      return { requiresQuote: true, rate12, rate24, days, billedHours, rentalAmount: null };
    }

    if (hasTripRate) {
      let rentalAmount = routeRate * days;
      const discountRate = billedHours > 48 ? (days >= 10 ? 0.10 : days >= 5 ? 0.03 : 0) : 0;
      rentalAmount = Math.round(rentalAmount * (1 - discountRate));
      return { requiresQuote: false, rate12, rate24, days, billedHours, rentalAmount };
    }

    if (billedHours <= 12) {
      return { requiresQuote: false, rate12, rate24, days, billedHours, rentalAmount: rate12 };
    }
    if (rate24 === null) {
      return { requiresQuote: true, rate12, rate24, days, billedHours, rentalAmount: null };
    }

    let rentalAmount;
    if (billedHours <= 24) rentalAmount = rate24;
    else if (billedHours <= 36) rentalAmount = rate24 + rate12;
    else if (billedHours <= 48) rentalAmount = rate24 * 2;
    else rentalAmount = rate24 * days;

    const discountRate = billedHours > 48 ? (days >= 10 ? 0.10 : days >= 5 ? 0.03 : 0) : 0;
    rentalAmount = Math.round(rentalAmount * (1 - discountRate));
    return { requiresQuote: false, rate12, rate24, days, billedHours, rentalAmount };
  }

  const api = { calculateRental };
  root.RentCarPricing = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
