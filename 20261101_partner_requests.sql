-- Demandes reçues depuis l'accueil : propriétaires de véhicules et entreprises.
create table if not exists public.partner_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('vehicle_owner','business_quote')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new','contacted','accepted','rejected','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.partner_requests enable row level security;
drop policy if exists partner_requests_public_insert on public.partner_requests;
create policy partner_requests_public_insert on public.partner_requests for insert to anon, authenticated with check (true);
drop policy if exists partner_requests_authenticated_read on public.partner_requests;
create policy partner_requests_authenticated_read on public.partner_requests for select to authenticated using (true);
drop policy if exists partner_requests_authenticated_update on public.partner_requests;
create policy partner_requests_authenticated_update on public.partner_requests for update to authenticated using (true) with check (true);
