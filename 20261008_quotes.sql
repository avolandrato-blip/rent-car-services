-- Demandes de devis client, convertibles ensuite en réservations.
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  customer_name text not null,
  customer_first_name text,
  whatsapp_phone text not null,
  customer_address text not null,
  zone text not null check (zone in ('city','under_150','over_150')),
  daily_rate numeric,
  days integer not null default 1,
  total_amount numeric,
  status text not null default 'pending' check (status in ('pending','converted','cancelled')),
  converted_reservation_id uuid references public.reservations(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.quote_requests enable row level security;

drop policy if exists quote_requests_admin_read on public.quote_requests;
create policy quote_requests_admin_read on public.quote_requests
  for select to authenticated using (true);

drop policy if exists quote_requests_admin_update on public.quote_requests;
create policy quote_requests_admin_update on public.quote_requests
  for update to authenticated using (true) with check (true);

create or replace function public.create_public_quote(p_payload jsonb)
returns table (id uuid, reference text)
language plpgsql security definer set search_path = public
as $$
declare
  new_id uuid;
  new_reference text;
begin
  if nullif(trim(p_payload->>'customer_name'), '') is null
     or nullif(trim(p_payload->>'whatsapp_phone'), '') is null
     or nullif(trim(p_payload->>'customer_address'), '') is null then
    raise exception 'Informations client incomplètes';
  end if;
  if (p_payload->>'zone') not in ('city','under_150','over_150') then
    raise exception 'Zone invalide';
  end if;
  new_reference := 'DEV-' || to_char(now(), 'YYYYMMDD-HH24MISS') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  insert into public.quote_requests (
    reference, vehicle_id, start_at, end_at, customer_name, customer_first_name,
    whatsapp_phone, customer_address, zone, daily_rate, days, total_amount
  ) values (
    new_reference,
    nullif(p_payload->>'vehicle_id','')::uuid,
    (p_payload->>'start_at')::timestamptz,
    (p_payload->>'end_at')::timestamptz,
    trim(p_payload->>'customer_name'),
    nullif(trim(p_payload->>'customer_first_name'),''),
    trim(p_payload->>'whatsapp_phone'),
    trim(p_payload->>'customer_address'),
    p_payload->>'zone',
    nullif(p_payload->>'daily_rate','')::numeric,
    greatest(1, coalesce(nullif(p_payload->>'days','')::integer,1)),
    nullif(p_payload->>'total_amount','')::numeric
  ) returning quote_requests.id, quote_requests.reference into new_id, new_reference;
  return query select new_id, new_reference;
end;
$$;

grant execute on function public.create_public_quote(jsonb) to anon, authenticated;
