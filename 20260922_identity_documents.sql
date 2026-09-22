insert into storage.buckets (id, name, public)
values ('contract-documents', 'contract-documents', false)
on conflict (id) do update set public = false;

create table if not exists public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  document_kind text not null check (document_kind in ('cin_recto','cin_verso','permis_recto')),
  storage_bucket text not null default 'contract-documents',
  storage_path text not null unique,
  original_name text,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0 and byte_size <= 8388608),
  sha256 text,
  uploaded_at timestamptz not null default now(),
  unique (reservation_id, document_kind)
);

create index if not exists contract_documents_reservation_idx
  on public.contract_documents (reservation_id, document_kind);

alter table public.contract_documents enable row level security;
revoke all on public.contract_documents from anon, authenticated;

create policy "authenticated users can read contract document metadata"
on public.contract_documents for select
to authenticated
using (true);

create policy "authenticated users can manage contract document metadata"
on public.contract_documents for all
to authenticated
using (true)
with check (true);

revoke all on storage.objects from anon;
