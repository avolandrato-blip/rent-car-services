-- Un profil super_admin sans date de fin bénéficie d'un accès permanent.
-- Sans ce cas NULL, les réservations étaient masquées par la RLS alors qu'elles existaient toujours.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1
    from public.account_profiles as p
    where p.user_id = (select auth.uid())
      and p.role = 'super_admin'
      and p.is_active
      and (p.access_ends_on is null or p.access_ends_on >= (now() at time zone 'Indian/Antananarivo')::date)
  );
$function$;
