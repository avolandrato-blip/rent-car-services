create table if not exists public.vehicle_damage_prices (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  component_key text not null check (length(btrim(component_key)) > 0),
  component_label text not null check (length(btrim(component_label)) > 0),
  price numeric(14, 2) check (price is null or price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, component_key)
);

create index if not exists vehicle_damage_prices_vehicle_id_idx
  on public.vehicle_damage_prices(vehicle_id);

alter table public.vehicle_damage_prices enable row level security;

revoke all on public.vehicle_damage_prices from anon, public;
grant select, insert, update, delete on public.vehicle_damage_prices to authenticated;

drop policy if exists vehicle_damage_prices_authenticated_manage on public.vehicle_damage_prices;
create policy vehicle_damage_prices_authenticated_manage
  on public.vehicle_damage_prices
  for all
  to authenticated
  using (true)
  with check (true);
