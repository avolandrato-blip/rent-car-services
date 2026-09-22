alter table public.reservations
  add column if not exists cin_is_duplicate boolean not null default false;

alter table public.customers
  add column if not exists cin_is_duplicate boolean not null default false;
