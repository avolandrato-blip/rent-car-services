(() => {
  const dateTime = value => value ? new Date(value).toLocaleString('fr-FR') : '—';
  const groupKey = reservation => reservation?.booking_group_id || reservation?.booking_group_reference || reservation?.id;
  const sortPeriods = rows => [...(rows || [])].sort((a, b) => new Date(a.start_at || 0) - new Date(b.start_at || 0));
  const groupReservations = (reservation, all) => {
    if (!reservation) return [];
    const key = groupKey(reservation);
    return sortPeriods((all || []).filter(item => groupKey(item) === key && item.status !== 'cancelled'));
  };
  const periodLines = (reservation, all, escape = value => String(value ?? '')) =>
    groupReservations(reservation, all).map((item, index) =>
      `<div><b>Période ${index + 1} :</b> ${escape(dateTime(item.start_at))} → ${escape(dateTime(item.end_at))}</div>`
    ).join('');
  const periodText = (reservation, all) => groupReservations(reservation, all)
    .map((item, index) => `Période ${index + 1} : ${dateTime(item.start_at)} → ${dateTime(item.end_at)}`).join(' · ');
  const sumField = (reservation, all, field) => groupReservations(reservation, all)
    .reduce((sum, item) => sum + Number(item?.[field] || 0), 0);
  const totalDays = (reservation, all) => groupReservations(reservation, all)
    .reduce((sum, item) => sum + Number(item?.days || 0), 0) || groupReservations(reservation, all).length || 1;
  window.RentCarBookingPeriods = { dateTime, groupKey, groupReservations, periodLines, periodText, sumField, totalDays };
})();
