-- Tarifs province pour les véhicules sans chauffeur.
alter table public.vehicles
  add column if not exists province_under_150_mode text not null default 'quote',
  add column if not exists province_under_150_price numeric,
  add column if not exists province_over_150_mode text not null default 'quote',
  add column if not exists province_over_150_price numeric;

alter table public.vehicles
  drop constraint if exists vehicles_province_under_150_mode_check,
  drop constraint if exists vehicles_province_over_150_mode_check;

alter table public.vehicles
  add constraint vehicles_province_under_150_mode_check check (province_under_150_mode in ('price','quote','unavailable')),
  add constraint vehicles_province_over_150_mode_check check (province_over_150_mode in ('price','quote','unavailable'));

alter table public.reservations
  add column if not exists province_zone text;
