alter table public.customers
  add column if not exists historical_paid_total numeric not null default 0,
  add column if not exists historical_reservation_count integer not null default 0,
  add column if not exists historical_first_reservation date,
  add column if not exists historical_last_reservation date,
  add column if not exists historical_vehicles text,
  add column if not exists historical_source_key text unique;

update public.customers
set historical_source_key = lower(trim(coalesce(nullif(cin, ''), full_name)))
where historical_source_key is null;
