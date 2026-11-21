-- Date-only edits for confirmed reservations. Financial values and payments are
-- intentionally preserved; the caller can review and adjust them separately.
CREATE OR REPLACE FUNCTION public.update_confirmed_reservation_dates(
  p_reservation_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
RETURNS TABLE (
  reservation_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  days integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_reservation public.reservations%ROWTYPE;
  v_vehicle public.vehicles%ROWTYPE;
  v_days integer;
BEGIN
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Invalid reservation dates' USING ERRCODE = '22007';
  END IF;

  SELECT r.*
    INTO v_reservation
    FROM public.reservations AS r
   WHERE r.id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found or access denied' USING ERRCODE = '42501';
  END IF;
  IF v_reservation.status NOT IN ('reserved'::public.reservation_status, 'completed'::public.reservation_status) THEN
    RAISE EXCEPTION 'Only confirmed or completed reservations can be rescheduled' USING ERRCODE = '22023';
  END IF;

  SELECT v.*
    INTO v_vehicle
    FROM public.vehicles AS v
   WHERE v.id = v_reservation.vehicle_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found or access denied' USING ERRCODE = '42501';
  END IF;

  IF v_vehicle.contract_start_date IS NOT NULL
     AND (p_start_at AT TIME ZONE 'Indian/Antananarivo')::date < v_vehicle.contract_start_date THEN
    RAISE EXCEPTION 'Reservation starts before vehicle contract' USING ERRCODE = '23514';
  END IF;
  IF v_vehicle.contract_end_date IS NOT NULL
     AND (p_end_at AT TIME ZONE 'Indian/Antananarivo')::date > v_vehicle.contract_end_date THEN
    RAISE EXCEPTION 'Reservation ends after vehicle contract' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.maintenance AS m
     WHERE m.vehicle_id = v_reservation.vehicle_id
       AND m.start_at < p_end_at
       AND m.end_at > p_start_at
  ) THEN
    RAISE EXCEPTION 'Vehicle is in maintenance for these dates' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.reservations AS other
     WHERE other.vehicle_id = v_reservation.vehicle_id
       AND other.id <> p_reservation_id
       AND other.status IN ('pre_reserved'::public.reservation_status, 'reserved'::public.reservation_status)
       AND other.start_at < p_end_at
       AND other.end_at > p_start_at
  ) THEN
    RAISE EXCEPTION 'Vehicle is already reserved for these dates' USING ERRCODE = '23P01';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.chauffeur_missions AS mission
     WHERE mission.reservation_id = p_reservation_id
       AND mission.status IN ('assigned', 'accepted', 'in_progress')
       AND (mission.starts_at < p_start_at OR mission.expires_at > p_end_at)
  ) THEN
    RAISE EXCEPTION 'Adjust the active driver mission before changing these dates' USING ERRCODE = '23514';
  END IF;

  v_days := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_end_at - p_start_at)) / 86400)::integer);

  -- The existing exclusion constraint remains the final race-safe overlap guard.
  RETURN QUERY
    UPDATE public.reservations AS r
       SET start_at = p_start_at,
           end_at = p_end_at,
           days = v_days
     WHERE r.id = p_reservation_id
     RETURNING r.id, r.start_at, r.end_at, r.days;
END;
$function$;

REVOKE ALL ON FUNCTION public.update_confirmed_reservation_dates(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_confirmed_reservation_dates(uuid, timestamptz, timestamptz) TO authenticated;
