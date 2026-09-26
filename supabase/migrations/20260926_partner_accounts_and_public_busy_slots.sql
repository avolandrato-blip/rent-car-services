-- Retain the three explicitly designated super-admin accounts through
-- 23:59 Madagascar time on 31 December 2100 (inclusive date comparison).
UPDATE public.account_profiles
SET access_ends_on = DATE '2100-12-31', updated_at = now()
WHERE role = 'super_admin';

ALTER TABLE public.account_profiles
  ADD CONSTRAINT account_profiles_super_admin_expiry_required
  CHECK (role <> 'super_admin' OR access_ends_on IS NOT NULL);

-- Enforce the super-admin account expiry at the database/RLS layer as well
-- as in the browser. A DATE remains valid until 23:59 Madagascar time.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_profiles AS p
    WHERE p.user_id = (SELECT auth.uid())
      AND p.role = 'super_admin'
      AND p.is_active
      AND p.access_ends_on >= (now() AT TIME ZONE 'Indian/Antananarivo')::date
  );
$function$;

-- Assign an already-created Supabase Auth account to the partner role.
-- Account creation/password delivery remain in Supabase Auth; no credentials are handled here.
CREATE OR REPLACE FUNCTION public.superadmin_assign_partner(
  p_email text,
  p_display_name text DEFAULT NULL,
  p_business_name text DEFAULT NULL,
  p_business_address text DEFAULT NULL,
  p_business_phone text DEFAULT NULL,
  p_business_email text DEFAULT NULL,
  p_business_legal_id text DEFAULT NULL,
  p_access_ends_on date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid;
  v_email text;
  v_profile_role text;
  v_assigned_user_id uuid;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Super-admin access required' USING ERRCODE = '42501';
  END IF;

  v_email := lower(trim(coalesce(p_email, '')));
  IF v_email = '' OR p_access_ends_on IS NULL THEN
    RAISE EXCEPTION 'Email and access end date are required' USING ERRCODE = '22023';
  END IF;
  IF p_access_ends_on < (now() AT TIME ZONE 'Indian/Antananarivo')::date THEN
    RAISE EXCEPTION 'Access end date cannot be in the past' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_user_id
  FROM auth.users AS u
  WHERE lower(u.email) = v_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Account not found in Supabase Auth; create it first' USING ERRCODE = 'P0002';
  END IF;

  SELECT ap.role INTO v_profile_role
  FROM public.account_profiles AS ap
  WHERE ap.user_id = v_user_id;
  IF v_profile_role = 'super_admin' THEN
    RAISE EXCEPTION 'An existing super-admin cannot be changed to partner' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.account_profiles (
    user_id, role, email, display_name, business_name, business_address,
    business_phone, business_email, business_legal_id, is_active, access_ends_on, created_by, updated_at
  ) VALUES (
    v_user_id, 'partner', v_email, nullif(trim(coalesce(p_display_name, '')), ''),
    nullif(trim(coalesce(p_business_name, '')), ''), nullif(trim(coalesce(p_business_address, '')), ''),
    nullif(trim(coalesce(p_business_phone, '')), ''), nullif(trim(coalesce(p_business_email, '')), ''),
    nullif(trim(coalesce(p_business_legal_id, '')), ''), true, p_access_ends_on, auth.uid(), now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = EXCLUDED.display_name,
    business_name = EXCLUDED.business_name,
    business_address = EXCLUDED.business_address,
    business_phone = EXCLUDED.business_phone,
    business_email = EXCLUDED.business_email,
    business_legal_id = EXCLUDED.business_legal_id,
    is_active = true,
    access_ends_on = EXCLUDED.access_ends_on,
    updated_at = now()
  WHERE public.account_profiles.role = 'partner'
  RETURNING user_id INTO v_assigned_user_id;

  IF v_assigned_user_id IS NULL THEN
    RAISE EXCEPTION 'An existing super-admin cannot be changed to partner' USING ERRCODE = '42501';
  END IF;
  RETURN v_assigned_user_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.superadmin_assign_partner(text, text, text, text, text, text, text, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.superadmin_assign_partner(text, text, text, text, text, text, text, date) TO authenticated;

-- A privacy-minimal public availability source. It reveals only whether/when a
-- physical vehicle is occupied; it never exposes customer, payment, or note data.
CREATE OR REPLACE VIEW public.public_fleet_busy_slots
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  r.vehicle_id,
  r.start_at,
  r.end_at,
  r.status::text AS slot_type
FROM public.reservations AS r
WHERE r.vehicle_id IS NOT NULL
  AND r.status IN ('pre_reserved', 'reserved')
UNION ALL
SELECT
  m.vehicle_id,
  m.start_at,
  m.end_at,
  'maintenance'::text AS slot_type
FROM public.maintenance AS m
WHERE m.vehicle_id IS NOT NULL;

REVOKE ALL ON public.public_fleet_busy_slots FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_fleet_busy_slots TO anon, authenticated;


-- A partner may manage a vehicle through the final calendar day of the partner
-- account's access, in Madagascar local time (RLS uses date-inclusive expiry).
DROP POLICY IF EXISTS vehicles_insert_scoped ON public.vehicles;
CREATE POLICY vehicles_insert_scoped ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR (
    public.has_active_partner_access()
    AND owner_user_id = (SELECT auth.uid())
    AND contract_end_date IS NOT NULL
    AND contract_end_date <= (SELECT public.current_partner_access_end())
    AND (contract_start_date IS NULL OR contract_start_date <= contract_end_date)
  )
);

DROP POLICY IF EXISTS vehicles_update_scoped ON public.vehicles;
CREATE POLICY vehicles_update_scoped ON public.vehicles
FOR UPDATE TO authenticated
USING (
  public.is_super_admin()
  OR (public.has_active_partner_access() AND owner_user_id = (SELECT auth.uid()))
)
WITH CHECK (
  public.is_super_admin()
  OR (
    public.has_active_partner_access()
    AND owner_user_id = (SELECT auth.uid())
    AND contract_end_date IS NOT NULL
    AND contract_end_date <= (SELECT public.current_partner_access_end())
    AND (contract_start_date IS NULL OR contract_start_date <= contract_end_date)
  )
);
