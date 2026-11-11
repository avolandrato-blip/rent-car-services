-- Évite la récursion RLS : les politiques de reservations vérifiaient directement
-- vehicles, dont une politique chauffeur relit reservations.
create or replace function public.reservation_vehicle_contract_covers(
  p_vehicle_id uuid,
  p_end_at timestamptz
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.contract_end_date is not null
      and (p_end_at at time zone 'Indian/Antananarivo')::date <= v.contract_end_date
  );
$function$;

revoke all on function public.reservation_vehicle_contract_covers(uuid, timestamptz) from public;
grant execute on function public.reservation_vehicle_contract_covers(uuid, timestamptz) to authenticated;

alter policy reservations_insert_scoped on public.reservations
with check (
  public.is_super_admin()
  or (
    public.has_active_partner_access()
    and public.owns_vehicle(reservations.vehicle_id)
    and reservations.status = any (array['pre_reserved'::public.reservation_status, 'reserved'::public.reservation_status])
    and reservations.start_at < reservations.end_at
    and (
      reservations.customer_id is null
      or exists (
        select 1
        from public.customers c
        where c.id = reservations.customer_id
          and c.owner_user_id = (select auth.uid())
      )
    )
    and public.reservation_vehicle_contract_covers(reservations.vehicle_id, reservations.end_at)
  )
);

alter policy reservations_update_scoped on public.reservations
using (
  public.is_super_admin()
  or (
    public.has_active_partner_access()
    and public.owns_vehicle(reservations.vehicle_id)
  )
)
with check (
  public.is_super_admin()
  or (
    public.has_active_partner_access()
    and public.owns_vehicle(reservations.vehicle_id)
    and reservations.start_at < reservations.end_at
    and (
      reservations.customer_id is null
      or public.owns_customer(reservations.customer_id)
    )
    and public.reservation_vehicle_contract_covers(reservations.vehicle_id, reservations.end_at)
  )
);
