create table if not exists public.contract_signing_links (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create unique index if not exists contract_signing_links_reservation_active_idx
  on public.contract_signing_links (reservation_id)
  where used_at is null;

create table if not exists public.contract_signatures (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  signing_link_id uuid not null references public.contract_signing_links(id) on delete restrict,
  signer_name text not null,
  signer_phone text not null,
  signature_data text not null check (length(signature_data) between 100 and 500000),
  contract_hash text not null,
  consent_text text not null,
  user_agent text,
  signed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (reservation_id, signing_link_id)
);

create index if not exists contract_signatures_reservation_idx
  on public.contract_signatures (reservation_id, signed_at desc);

alter table public.contract_signing_links enable row level security;
alter table public.contract_signatures enable row level security;

create or replace function public.contract_payload_hash(
  p_reservation_id uuid
)
returns text
language sql
stable
security definer
set search_path = public, extensions
as $$
  select encode(extensions.digest(convert_to(
    coalesce(r.id::text,'') || '|' || coalesce(r.reference,'') || '|' ||
    coalesce(r.customer_name,'') || '|' || coalesce(r.customer_phone,'') || '|' ||
    coalesce(v.name,'') || '|' || coalesce(r.start_at::text,'') || '|' ||
    coalesce(r.end_at::text,'') || '|' || coalesce(r.total_amount::text,'') ||
    '|rent-car-contract-v1', 'UTF8'), 'sha256'), 'hex')
  from public.reservations r
  left join public.vehicles v on v.id = r.vehicle_id
  where r.id = p_reservation_id;
$$;

create or replace function public.create_contract_signing_link(p_reservation_id uuid)
returns table(token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_hash text;
  v_expires timestamptz;
  v_link_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.reservations where id = p_reservation_id) then
    raise exception 'Reservation not found';
  end if;
  update public.contract_signing_links
     set used_at = coalesce(used_at, now())
   where reservation_id = p_reservation_id and used_at is null;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  v_hash := encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex');
  v_expires := now() + interval '7 days';
  insert into public.contract_signing_links(reservation_id, token_hash, expires_at, created_by)
  values (p_reservation_id, v_hash, v_expires, auth.uid())
  returning id into v_link_id;
  return query select v_token, v_expires;
end;
$$;

create or replace function public.get_contract_for_signing(p_token text)
returns table(
  reservation_id uuid, reference text, customer_name text, customer_phone text,
  customer_email text, customer_address text, vehicle_name text, vehicle_registration text,
  start_at timestamptz, end_at timestamptz, total_amount numeric, deposit_amount numeric,
  contract_hash text, expires_at timestamptz, already_signed boolean
)
language sql
security definer
set search_path = public, extensions
as $$
  select r.id, r.reference, r.customer_name, r.customer_phone, r.customer_email,
    r.customer_address, v.name, v.registration_number, r.start_at, r.end_at,
    r.total_amount, r.deposit_amount, public.contract_payload_hash(r.id), l.expires_at,
    exists(select 1 from public.contract_signatures s where s.signing_link_id = l.id)
  from public.contract_signing_links l
  join public.reservations r on r.id = l.reservation_id
  left join public.vehicles v on v.id = r.vehicle_id
  where l.token_hash = encode(extensions.digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex')
    and l.expires_at > now() and l.used_at is null;
$$;

create or replace function public.sign_contract(
  p_token text,
  p_signer_name text,
  p_signer_phone text,
  p_signature_data text,
  p_contract_hash text,
  p_consent_text text,
  p_user_agent text default null
)
returns table(signature_id uuid, signed_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_link public.contract_signing_links%rowtype;
  v_reservation_id uuid;
  v_hash text;
  v_signature_id uuid;
  v_signed_at timestamptz;
begin
  if length(trim(coalesce(p_signer_name,''))) < 2 then raise exception 'Signer name is required'; end if;
  if length(trim(coalesce(p_signer_phone,''))) < 6 then raise exception 'Signer phone is required'; end if;
  if length(coalesce(p_signature_data,'')) < 100 or length(p_signature_data) > 500000 then raise exception 'Invalid signature'; end if;
  select l.* into v_link from public.contract_signing_links l
  where l.token_hash = encode(extensions.digest(convert_to(trim(p_token), 'UTF8'), 'sha256'), 'hex')
    and l.expires_at > now() and l.used_at is null
  for update;
  if not found then raise exception 'Invalid, expired or already used signing link'; end if;
  v_reservation_id := v_link.reservation_id;
  v_hash := public.contract_payload_hash(v_reservation_id);
  if v_hash is null or v_hash <> p_contract_hash then raise exception 'Contract changed; please request a new link'; end if;
  insert into public.contract_signatures(reservation_id, signing_link_id, signer_name, signer_phone, signature_data, contract_hash, consent_text, user_agent)
  values (v_reservation_id, v_link.id, trim(p_signer_name), trim(p_signer_phone), p_signature_data, p_contract_hash, p_consent_text, left(p_user_agent, 1000))
  returning id, signed_at into v_signature_id, v_signed_at;
  update public.contract_signing_links set used_at = v_signed_at where id = v_link.id;
  update public.reservations set terms_accepted_at = v_signed_at where id = v_reservation_id;
  return query select v_signature_id, v_signed_at;
exception when unique_violation then
  raise exception 'Contract already signed';
end;
$$;

revoke all on public.contract_signing_links from anon, authenticated;
revoke all on public.contract_signatures from anon, authenticated;
grant execute on function public.contract_payload_hash(uuid) to authenticated;
grant execute on function public.create_contract_signing_link(uuid) to authenticated;
grant execute on function public.get_contract_for_signing(text) to anon, authenticated;
grant execute on function public.sign_contract(text,text,text,text,text,text,text) to anon, authenticated;
