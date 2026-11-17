-- Break the RLS cycle: reservation/vehicle policies read chauffeur_missions,
-- while the partner mission policy previously read reservations and vehicles.
-- This SECURITY DEFINER helper checks the same ownership condition without
-- recursively re-entering those tables' RLS policies.
CREATE OR REPLACE FUNCTION public.partner_owns_chauffeur_mission(p_reservation_id uuid)
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
       JOIN public.vehicles v ON v.id = r.vehicle_id
       WHERE r.id = p_reservation_id
         AND v.owner_user_id = auth.uid()
     );
$function$;

REVOKE ALL ON FUNCTION public.partner_owns_chauffeur_mission(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_owns_chauffeur_mission(uuid) TO authenticated;

DROP POLICY IF EXISTS chauffeur_missions_partner_read ON public.chauffeur_missions;
CREATE POLICY chauffeur_missions_partner_read ON public.chauffeur_missions
  FOR SELECT TO authenticated
  USING (public.partner_owns_chauffeur_mission(reservation_id));
