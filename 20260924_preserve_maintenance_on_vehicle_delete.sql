alter table public.maintenance
  alter column vehicle_id drop not null;

alter table public.maintenance
  drop constraint if exists maintenance_vehicle_id_fkey;

alter table public.maintenance
  add constraint maintenance_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete set null;

