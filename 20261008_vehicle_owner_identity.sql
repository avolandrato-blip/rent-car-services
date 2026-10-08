-- Coordonnées du propriétaire utilisées dans les contrats lorsque renseignées.
alter table public.vehicles
  add column if not exists owner_first_name text,
  add column if not exists owner_address text,
  add column if not exists owner_nif text,
  add column if not exists owner_stat text;
