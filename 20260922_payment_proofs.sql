insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do update set public = false;

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  storage_bucket text not null default 'payment-proofs',
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 8388608),
  payment_method text not null default 'mobile_money',
  amount_declared numeric not null default 0 check (amount_declared >= 0),
  verification_status text not null default 'pending' check (verification_status in ('pending','approved','rejected')),
  uploaded_at timestamptz not null default now(),
  unique (reservation_id)
);

create index if not exists payment_proofs_reservation_idx
  on public.payment_proofs (reservation_id);

alter table public.payment_proofs enable row level security;
revoke all on public.payment_proofs from anon, authenticated;

create policy "authenticated users can read payment proof metadata"
on public.payment_proofs for select
to authenticated
using (true);

create policy "authenticated users can manage payment proof metadata"
on public.payment_proofs for all
to authenticated
using (true)
with check (true);

revoke all on storage.objects from anon;
