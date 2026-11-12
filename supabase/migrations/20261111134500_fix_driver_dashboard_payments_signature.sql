-- Correct driver dashboard access for accepted missions and advance collections.
-- All reads and writes remain scoped to the authenticated driver assigned to the mission.

DROP POLICY IF EXISTS reservations_chauffeur_read ON public.reservations;
CREATE POLICY reservations_chauffeur_read ON public.reservations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chauffeur_missions m
      JOIN public.chauffeurs c ON c.id = m.chauffeur_id
      WHERE m.reservation_id = reservations.id
        AND c.auth_user_id = (SELECT auth.uid())
        AND m.status IN ('assigned', 'accepted', 'in_progress', 'completed')
    )
  );

DROP POLICY IF EXISTS vehicles_chauffeur_read ON public.vehicles;
CREATE POLICY vehicles_chauffeur_read ON public.vehicles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chauffeur_missions m
      JOIN public.chauffeurs c ON c.id = m.chauffeur_id
      JOIN public.reservations r ON r.id = m.reservation_id
      WHERE r.vehicle_id = vehicles.id
        AND c.auth_user_id = (SELECT auth.uid())
        AND m.status IN ('assigned', 'accepted', 'in_progress', 'completed')
    )
  );

-- Drivers may record an advance against their own active, unexpired assignment;
-- the UI still caps each entry at the unpaid reservation/daily-due balance.
DROP POLICY IF EXISTS payments_chauffeur_insert ON public.payments;
CREATE POLICY payments_chauffeur_insert ON public.payments
  FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by_chauffeur_id IS NOT NULL
    AND source = 'chauffeur'
    AND EXISTS (
      SELECT 1
      FROM public.chauffeurs c
      JOIN public.chauffeur_missions m ON m.chauffeur_id = c.id
      WHERE c.id = payments.recorded_by_chauffeur_id
        AND c.auth_user_id = (SELECT auth.uid())
        AND m.reservation_id = payments.reservation_id
        AND m.status IN ('assigned', 'accepted', 'in_progress')
        AND m.expires_at >= now()
    )
  );

CREATE OR REPLACE FUNCTION public.save_chauffeur_reservation_signature(
  p_mission_id uuid,
  p_signature_data text,
  p_signer_name text,
  p_signer_phone text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_reservation_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR p_signature_data IS NULL
     OR length(p_signature_data) > 500000
     OR p_signature_data !~ '^data:image/png;base64,[A-Za-z0-9+/]+={0,2}$' THEN
    RETURN false;
  END IF;

  SELECT m.reservation_id INTO v_reservation_id
  FROM public.chauffeur_missions m
  JOIN public.chauffeurs c ON c.id = m.chauffeur_id
  WHERE m.id = p_mission_id
    AND c.auth_user_id = auth.uid()
    AND m.status IN ('assigned', 'accepted', 'in_progress')
    AND m.expires_at >= now()
  LIMIT 1;

  IF v_reservation_id IS NULL THEN
    RETURN false;
  END IF;

  INSERT INTO public.reservation_client_signatures AS saved (reservation_id, signature_data)
  VALUES (v_reservation_id, p_signature_data)
  ON CONFLICT (reservation_id) DO UPDATE
    SET signature_data = excluded.signature_data,
        updated_at = now();

  UPDATE public.chauffeur_missions
  SET notes = left(
        coalesce(notes, '')
        || CASE WHEN coalesce(notes, '') = '' THEN '' ELSE E'\n' END
        || 'Signature client : '
        || left(trim(coalesce(p_signer_name, '')), 120)
        || ' — '
        || left(trim(coalesce(p_signer_phone, '')), 40),
        2000
      ),
      updated_at = now()
  WHERE id = p_mission_id;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_chauffeur_reservation_signature(uuid, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.save_chauffeur_reservation_signature(uuid, text, text, text) TO authenticated;

-- Return only a boolean and mission identifiers; never expose signature image data.
CREATE OR REPLACE FUNCTION public.get_chauffeur_mission_signature_status()
RETURNS TABLE (mission_id uuid, reservation_id uuid, client_signature_present boolean)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  SELECT m.id,
         m.reservation_id,
         EXISTS (
           SELECT 1
           FROM public.reservation_client_signatures s
           WHERE s.reservation_id = m.reservation_id
         ) AS client_signature_present
  FROM public.chauffeur_missions m
  JOIN public.chauffeurs c ON c.id = m.chauffeur_id
  WHERE c.auth_user_id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.get_chauffeur_mission_signature_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_chauffeur_mission_signature_status() TO authenticated;
