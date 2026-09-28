create table if not exists public.chauffeurs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  photo_url text,
  phone text,
  whatsapp text,
  permits text[] not null default '{}',
  city_daily_rate numeric not null default 20000 check (city_daily_rate >= 20000 and city_daily_rate <= 50000),
  city_24h_rate numeric not null default 20000 check (city_24h_rate >= 20000 and city_24h_rate <= 50000),
  province_daily_rate numeric not null default 20000 check (province_daily_rate >= 20000 and province_daily_rate <= 50000),
  delivery_rate numeric not null default 20000 check (delivery_rate >= 20000 and delivery_rate <= 50000),
  recovery_rate numeric not null default 20000 check (recovery_rate >= 20000 and recovery_rate <= 50000),
  lodging_included boolean not null default false,
  meals_included boolean not null default false,
  availability text not null default 'available' check (availability in ('available','by_booking','unavailable')),
  description text,
  languages text,
  experience_years integer check (experience_years is null or experience_years >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chauffeurs enable row level security;

drop policy if exists chauffeurs_public_read on public.chauffeurs;
create policy chauffeurs_public_read on public.chauffeurs for select using (active = true and availability <> 'unavailable');

drop policy if exists chauffeurs_authenticated_manage on public.chauffeurs;
create policy chauffeurs_authenticated_manage on public.chauffeurs for all to authenticated using (true) with check (true);
