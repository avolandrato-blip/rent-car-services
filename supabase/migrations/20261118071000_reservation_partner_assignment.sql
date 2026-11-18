ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS partner_user_id uuid REFERENCES public.account_profiles(user_id) ON DELETE SET NULL;

ALTER TABLE public.account_profiles
  ADD COLUMN IF NOT EXISTS partner_contract_template_key text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('partner-contract-templates', 'partner-contract-templates', false, 10485760, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE INDEX IF NOT EXISTS reservations_partner_user_created_idx
  ON public.reservations (partner_user_id, created_at DESC)
  WHERE partner_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.partner_can_read_assigned_vehicle(p_vehicle_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.has_active_partner_access()
     AND EXISTS (
       SELECT 1
       FROM public.reservations r
       WHERE r.vehicle_id = p_vehicle_id
         AND r.partner_user_id = auth.uid()
     );
$function$;
REVOKE ALL ON FUNCTION public.partner_can_read_assigned_vehicle(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_can_read_assigned_vehicle(uuid) TO authenticated;

DROP POLICY IF EXISTS reservations_read_scoped ON public.reservations;
CREATE POLICY reservations_read_scoped ON public.reservations
FOR SELECT TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR (
    (SELECT public.has_active_partner_access())
    AND (
      (SELECT public.owns_vehicle(reservations.vehicle_id))
      OR reservations.partner_user_id = (SELECT auth.uid())
    )
  )
);

DROP POLICY IF EXISTS vehicles_read_scoped ON public.vehicles;
CREATE POLICY vehicles_read_scoped ON public.vehicles
FOR SELECT TO authenticated
USING (
  (SELECT public.is_super_admin())
  OR (
    (SELECT public.has_active_partner_access())
    AND (
      owner_user_id = (SELECT auth.uid())
      OR (SELECT public.partner_can_read_assigned_vehicle(vehicles.id))
    )
  )
);

CREATE OR REPLACE FUNCTION public.admin_assign_reservation_partner(
  p_reservation_id uuid,
  p_partner_user_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_status text;
  v_updated integer;
BEGIN
  IF NOT (SELECT public.is_super_admin()) THEN
    RAISE EXCEPTION 'Accès réservé au super-admin.' USING ERRCODE = '42501';
  END IF;

  SELECT r.booking_group_id, r.status::text
    INTO v_group_id, v_status
  FROM public.reservations r
  WHERE r.id = p_reservation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Réservation introuvable.' USING ERRCODE = 'P0002';
  END IF;
  IF v_status NOT IN ('pre_reserved', 'reserved') THEN
    RAISE EXCEPTION 'Seules les réservations en attente ou confirmées peuvent être attribuées.' USING ERRCODE = '22023';
  END IF;

  IF p_partner_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.account_profiles p
    WHERE p.user_id = p_partner_user_id
      AND p.role = 'partner'
      AND p.is_active = true
      AND p.must_change_password = false
      AND (p.access_ends_on IS NULL OR p.access_ends_on >= (now() AT TIME ZONE 'Indian/Antananarivo')::date)
      AND p.partner_contract_template_key IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Le partenaire est introuvable, inactif ou son accès n’est pas encore activé.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.reservations r
  SET partner_user_id = p_partner_user_id,
      updated_at = now()
  WHERE (r.id = p_reservation_id OR (v_group_id IS NOT NULL AND r.booking_group_id = v_group_id))
    AND r.status::text IN ('pre_reserved', 'reserved');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_assign_reservation_partner(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_assign_reservation_partner(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_update_assigned_reservation(
  p_reservation_id uuid,
  p_status text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_group_id uuid;
  v_status text;
  v_updated integer;
BEGIN
  IF NOT (SELECT public.has_active_partner_access()) THEN
    RAISE EXCEPTION 'Accès partenaire inactif.' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('reserved', 'cancelled', 'completed') THEN
    RAISE EXCEPTION 'Statut demandé non autorisé.' USING ERRCODE = '22023';
  END IF;

  SELECT r.booking_group_id, r.status::text
    INTO v_group_id, v_status
  FROM public.reservations r
  WHERE r.id = p_reservation_id
    AND r.partner_user_id = auth.uid()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette réservation n’est pas attribuée à votre compte.' USING ERRCODE = '42501';
  END IF;
  IF NOT (
    (v_status = 'pre_reserved' AND p_status IN ('reserved', 'cancelled'))
    OR (v_status = 'reserved' AND p_status IN ('cancelled', 'completed'))
  ) THEN
    RAISE EXCEPTION 'Transition de statut non autorisée.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.reservations r
  SET status = p_status::public.reservation_status,
      updated_at = now()
  WHERE (r.id = p_reservation_id OR (v_group_id IS NOT NULL AND r.booking_group_id = v_group_id))
    AND r.partner_user_id = auth.uid()
    AND ((v_status = 'pre_reserved' AND r.status::text = 'pre_reserved')
      OR (v_status = 'reserved' AND r.status::text = 'reserved'));
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$function$;
REVOKE ALL ON FUNCTION public.partner_update_assigned_reservation(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_update_assigned_reservation(uuid, text) TO authenticated;

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
      'cin_acquired_place', r.cin_acquired_place,
      'cin_acquired_at', r.cin_acquired_at,
      'license_acquired_place', r.license_acquired_place,
      'license_acquired_at', r.license_acquired_at,
      'start_at', r.start_at,
      'end_at', r.end_at,
      'days', r.days,
      'rental_type', r.rental_type,
      'total_amount', r.total_amount,
      'deposit_amount', r.deposit_amount,
      'daily_rate', r.daily_rate,
      'payment_method', r.payment_method,
      'delivery_fee', r.delivery_fee,
      'recovery_fee', r.recovery_fee,
      'chauffeur_fee', r.chauffeur_fee,
      'trip_from', r.trip_from,
      'trip_to', r.trip_to,
      'with_driver', r.with_driver,
      'partner_user_id', r.partner_user_id
    ),
    'vehicle', jsonb_build_object(
      'name', v.name,
      'make', v.make,
      'model', v.model,
      'description', v.description,
      'registration_number', v.registration_number,
      'driver_mode', v.driver_mode
    ),
    'owner', jsonb_build_object(
      'name', CASE WHEN r.partner_user_id IS NULL THEN 'ANDRIANASOLO Volandrato' ELSE coalesce(nullif(ap.business_name, ''), nullif(ap.display_name, ''), 'Partenaire') END,
      'address', CASE WHEN r.partner_user_id IS NULL THEN '67 HA Nord-Ouest, Antananarivo, 101' ELSE coalesce(ap.business_address, '') END,
      'phone', CASE WHEN r.partner_user_id IS NULL THEN '034 91 207 26' ELSE coalesce(ap.business_phone, '') END,
      'email', CASE WHEN r.partner_user_id IS NULL THEN '' ELSE coalesce(ap.business_email, '') END,
      'legal_id', CASE WHEN r.partner_user_id IS NULL THEN '' ELSE coalesce(ap.business_legal_id, '') END,
      'partner_contract_template_key', CASE WHEN r.partner_user_id IS NULL THEN NULL ELSE ap.partner_contract_template_key END
    )
  ) INTO v_result
  FROM public.reservations r
  JOIN public.vehicles v ON v.id = r.vehicle_id
  LEFT JOIN public.account_profiles ap ON ap.user_id = r.partner_user_id
  WHERE r.id = v_reservation_id
    AND r.invoice_released = true
    AND r.otp_code = left(trim(p_otp), 20);

  RETURN v_result;
END;
$function$;
