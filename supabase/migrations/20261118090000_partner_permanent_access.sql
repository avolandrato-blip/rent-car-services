-- Partner accounts may have no expiration date. NULL means permanent access.
CREATE OR REPLACE FUNCTION public.has_active_partner_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT EXISTS (SELECT 1 FROM public.account_profiles AS p
    WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'partner' AND p.is_active = true
      AND p.must_change_password = false
      AND (p.access_ends_on IS NULL OR p.access_ends_on >= (now() AT TIME ZONE 'Indian/Antananarivo')::date));
$function$;
CREATE OR REPLACE FUNCTION public.current_partner_access_end()
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $function$
  SELECT p.access_ends_on FROM public.account_profiles AS p
    WHERE p.user_id = (SELECT auth.uid()) AND p.role = 'partner' AND p.is_active = true
      AND p.must_change_password = false
      AND (p.access_ends_on IS NULL OR p.access_ends_on >= (now() AT TIME ZONE 'Indian/Antananarivo')::date)
    LIMIT 1;
$function$;
