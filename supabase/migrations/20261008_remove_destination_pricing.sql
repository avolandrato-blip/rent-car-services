-- Remove obsolete destination-specific price data and keep distance-band pricing.
-- The trip_from/trip_to itinerary columns are deliberately preserved.

DROP VIEW IF EXISTS public.public_fleet_vehicles;

CREATE VIEW public.public_fleet_vehicles
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  id,
  name,
  slug,
  description,
  price_per_day,
  transmission,
  fuel,
  seats,
  status,
  image_urls,
  make,
  model,
  price_12h,
  price_24h,
  driver_mode,
  driver_fee,
  extra_driver_fee,
  owner_phone,
  owner_whatsapp_enabled,
  contract_start_date,
  contract_end_date,
  fleet_group
FROM public.vehicles
WHERE (status = 'available' OR (fleet_group IS NOT NULL AND status <> 'contract_ended'))
  AND (contract_end_date IS NULL OR contract_end_date >= (now() AT TIME ZONE 'Indian/Antananarivo')::date);

REVOKE ALL ON public.public_fleet_vehicles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_fleet_vehicles TO anon, authenticated;

-- The active reservation flow uses create_public_distance_reservation instead.
DROP FUNCTION IF EXISTS public.create_public_reservation(jsonb);

-- Preserve the invoice lookup, route, and booking details, but stop returning obsolete destination-price snapshots.
CREATE OR REPLACE FUNCTION public.get_public_invoice_by_otp(p_reference text, p_phone text, p_otp text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reservation_id uuid;
  v_attempts integer;
  v_result jsonb;
BEGIN
  SELECT r.id INTO v_reservation_id
  FROM public.reservations r
  WHERE r.reference = left(trim(p_reference), 100)
    AND regexp_replace(coalesce(r.customer_phone, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g')
  LIMIT 1;

  IF v_reservation_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.public_invoice_otp_attempts AS attempts(reservation_id, window_started_at, attempt_count, updated_at)
  VALUES(v_reservation_id, now(), 1, now())
  ON CONFLICT(reservation_id) DO UPDATE
  SET attempt_count = CASE WHEN attempts.window_started_at < now() - interval '1 hour' THEN 1 ELSE attempts.attempt_count + 1 END,
      window_started_at = CASE WHEN attempts.window_started_at < now() - interval '1 hour' THEN now() ELSE attempts.window_started_at END,
      updated_at = now()
  RETURNING attempt_count INTO v_attempts;

  IF v_attempts > 10 THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'reservation', jsonb_build_object(
      'id', r.id,
      'reference', r.reference,
      'customer_name', r.customer_name,
      'customer_phone', r.customer_phone,
      'customer_email', r.customer_email,
      'customer_address', r.customer_address,
      'customer_license', r.customer_license,
      'customer_cin', r.customer_cin,
      'cin_is_duplicate', r.cin_is_duplicate,
      'start_at', r.start_at,
      'end_at', r.end_at,
      'days', r.days,
      'rental_type', r.rental_type,
      'total_amount', r.total_amount,
      'deposit_amount', r.deposit_amount,
      'payment_method', r.payment_method,
      'delivery_fee', r.delivery_fee,
      'recovery_fee', r.recovery_fee,
      'chauffeur_fee', r.chauffeur_fee,
      'trip_from', r.trip_from,
      'trip_to', r.trip_to,
      'with_driver', r.with_driver
    ),
    'vehicle', jsonb_build_object(
      'name', v.name,
      'make', v.make,
      'model', v.model,
      'registration_number', v.registration_number,
      'driver_mode', v.driver_mode
    ),
    'owner', jsonb_build_object(
      'name', coalesce(nullif(ap.business_name, ''), CASE WHEN v.owner_user_id IS NULL THEN 'ANDRIANASOLO Volandrato' ELSE ap.display_name END),
      'address', coalesce(nullif(ap.business_address, ''), CASE WHEN v.owner_user_id IS NULL THEN '67 HA Nord-Ouest, Antananarivo, 101' ELSE '' END),
      'phone', coalesce(nullif(ap.business_phone, ''), CASE WHEN v.owner_user_id IS NULL THEN '034 91 207 26' ELSE '' END),
      'email', coalesce(ap.business_email, ''),
      'legal_id', coalesce(ap.business_legal_id, '')
    )
  ) INTO v_result
  FROM public.reservations r
  JOIN public.vehicles v ON v.id = r.vehicle_id
  LEFT JOIN public.account_profiles ap ON ap.user_id = v.owner_user_id
  WHERE r.id = v_reservation_id
    AND r.invoice_released = true
    AND r.otp_code = left(trim(p_otp), 20);

  RETURN v_result;
END;
$function$;

ALTER TABLE public.vehicles DROP COLUMN IF EXISTS trip_rates;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS trip_rate_label;
ALTER TABLE public.reservations DROP COLUMN IF EXISTS trip_rate_per_day;
