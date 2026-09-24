-- Contract windows, owner WhatsApp routing, and pending owner confirmation.
alter type public.vehicle_status add value if not exists 'contract_ended';

alter table public.vehicles
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists owner_whatsapp_enabled boolean not null default false;

alter table public.reservations
  add column if not exists owner_confirmation_status text not null default 'not_required';

alter table public.reservations
  drop constraint if exists reservations_owner_confirmation_status_check;

alter table public.reservations
  add constraint reservations_owner_confirmation_status_check
  check (owner_confirmation_status in ('not_required','pending','confirmed','rejected'));
