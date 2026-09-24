alter table public.reservations
  alter column vehicle_id drop not null;

alter table public.reservations
  drop constraint if exists reservations_vehicle_id_fkey;

alter table public.reservations
  add constraint reservations_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete set null;

