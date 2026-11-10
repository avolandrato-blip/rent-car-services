-- Workflow sécurisé des missions chauffeur, états des lieux privés et échéances quotidiennes.
-- Les règles d'accès administrateur existantes restent en place : aucune ouverture RLS générale.

alter table public.chauffeur_missions
  add column if not exists acceptance_token_hash text,
  add column if not exists acceptance_expires_at timestamptz,
  add column if not exists responded_at timestamptz,
  add column if not exists responded_by uuid references auth.users(id) on delete set null,
  add column if not exists handover_address text,
  add column if not exists driver_instructions text;

-- Une ancienne règle accordait tous les droits chauffeur à tout compte authentifié.
-- Remplacer cette règle par le même garde super-admin que celui des missions.
drop policy if exists chauffeurs_authenticated_manage on public.chauffeurs;
drop policy if exists chauffeurs_admin_manage on public.chauffeurs;
create policy chauffeurs_admin_manage on public.chauffeurs
  for all to authenticated
  using (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ))
  with check (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ));

alter table public.chauffeur_missions
  drop constraint if exists chauffeur_missions_status_check;
alter table public.chauffeur_missions
  add constraint chauffeur_missions_status_check
  check (status in ('assigned','accepted','refused','in_progress','completed','cancelled','expired'));

create index if not exists chauffeur_missions_acceptance_token_idx
  on public.chauffeur_missions(acceptance_token_hash)
  where acceptance_token_hash is not null;

-- L'administration crée la mission via une RPC qui vérifie elle-même le profil.
-- Cela évite un échec RLS opaque côté PostgREST sans accorder INSERT aux utilisateurs ordinaires.
create or replace function public.assign_chauffeur_mission(
  p_chauffeur_id uuid,
  p_reservation_id uuid,
  p_mission_type text,
  p_custom_delivery_cost numeric,
  p_custom_recovery_cost numeric,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_handover_address text,
  p_notes text,
  p_driver_instructions text,
  p_acceptance_token_hash text,
  p_acceptance_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_mission_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.account_profiles p
    where p.user_id = auth.uid() and p.role = 'super_admin' and p.is_active = true
  ) then
    raise exception 'Session non autorisée : un compte super-administrateur actif est requis.' using errcode = '42501';
  end if;
  if p_mission_type is null
     or p_mission_type not in ('delivery','recovery','delivery_and_recovery')
     or p_starts_at is null or p_expires_at is null
     or p_expires_at <= p_starts_at
     or p_expires_at > p_starts_at + interval '24 hours'
     or p_custom_delivery_cost is null or p_custom_delivery_cost < 0
     or p_custom_recovery_cost is null or p_custom_recovery_cost < 0
     or p_acceptance_token_hash is null
     or p_acceptance_token_hash !~ '^[0-9a-f]{64}$'
     or p_acceptance_expires_at is null
     or p_acceptance_expires_at < now()
     or p_acceptance_expires_at > p_expires_at then
    raise exception 'Données de mission invalides (fenêtre maximale : 24 h).' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.chauffeurs c
    where c.id = p_chauffeur_id and c.active = true
      and c.auth_user_id is not null and c.login_name is not null
  ) then
    raise exception 'Le chauffeur doit être actif et disposer d’un compte team.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.reservations r
    where r.id = p_reservation_id and r.status = 'reserved'
  ) then
    raise exception 'La réservation doit être confirmée avant l’attribution.' using errcode = '23514';
  end if;

  insert into public.chauffeur_missions (
    chauffeur_id, reservation_id, mission_type, status,
    custom_delivery_cost, custom_recovery_cost, starts_at, expires_at,
    acceptance_token_hash, acceptance_expires_at, assigned_by,
    handover_address, notes, driver_instructions
  ) values (
    p_chauffeur_id, p_reservation_id, p_mission_type, 'assigned',
    p_custom_delivery_cost, p_custom_recovery_cost, p_starts_at, p_expires_at,
    p_acceptance_token_hash, p_acceptance_expires_at, auth.uid(),
    nullif(p_handover_address,''), nullif(p_notes,''), nullif(p_driver_instructions,'')
  ) returning id into v_mission_id;

  return v_mission_id;
end;
$function$;

revoke all on function public.assign_chauffeur_mission(uuid,uuid,text,numeric,numeric,timestamptz,timestamptz,text,text,text,text,timestamptz) from public, anon;
grant execute on function public.assign_chauffeur_mission(uuid,uuid,text,numeric,numeric,timestamptz,timestamptz,text,text,text,text,timestamptz) to authenticated;

-- Échéances quotidiennes attachées à une réservation unique, jamais une mission distincte par jour.
create table if not exists public.reservation_daily_dues (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  due_date date not null,
  due_amount numeric not null check (due_amount > 0),
  created_at timestamptz not null default now(),
  primary key (reservation_id, due_date)
);

alter table public.payments
  add column if not exists due_date date;
create index if not exists payments_reservation_due_date_idx
  on public.payments(reservation_id, due_date, paid_at);

create or replace function public.validate_reservation_daily_due_payment()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_due_amount numeric;
  v_already_paid numeric;
begin
  if new.due_date is null then return new; end if;

  select d.due_amount into v_due_amount
    from public.reservation_daily_dues d
   where d.reservation_id = new.reservation_id and d.due_date = new.due_date
   for update;
  if v_due_amount is null then
    raise exception 'Aucune échéance quotidienne pour cette réservation à cette date.' using errcode = '23514';
  end if;

  select coalesce(sum(p.amount),0) into v_already_paid
    from public.payments p
   where p.reservation_id = new.reservation_id
     and p.due_date = new.due_date
     and p.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_already_paid + new.amount > v_due_amount then
    raise exception 'Le paiement dépasse le solde de l’échéance quotidienne.' using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists validate_reservation_daily_due_payment on public.payments;
create trigger validate_reservation_daily_due_payment
before insert or update of reservation_id, due_date, amount on public.payments
for each row execute function public.validate_reservation_daily_due_payment();

alter table public.reservation_daily_dues enable row level security;
revoke all on public.reservation_daily_dues from anon, public;
grant select, insert, update, delete on public.reservation_daily_dues to authenticated;

drop policy if exists reservation_daily_dues_admin_all on public.reservation_daily_dues;
create policy reservation_daily_dues_admin_all on public.reservation_daily_dues
  for all to authenticated
  using (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ))
  with check (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ));

drop policy if exists reservation_daily_dues_driver_read on public.reservation_daily_dues;
create policy reservation_daily_dues_driver_read on public.reservation_daily_dues
  for select to authenticated
  using (exists (
    select 1
    from public.chauffeur_missions m
    join public.chauffeurs c on c.id = m.chauffeur_id
    where m.reservation_id = reservation_daily_dues.reservation_id
      and c.auth_user_id = (select auth.uid())
      and m.status in ('assigned','accepted','in_progress','completed')
  ));

-- Les chauffeurs ne peuvent toujours enregistrer un paiement que pour leur mission active.
-- Le statut « accepted » est ajouté pour couvrir la transition de mission.
drop policy if exists payments_chauffeur_insert on public.payments;
create policy payments_chauffeur_insert on public.payments
  for insert to authenticated
  with check (
    recorded_by_chauffeur_id is not null
    and source = 'chauffeur'
    and exists (
      select 1
      from public.chauffeurs c
      join public.chauffeur_missions m on m.chauffeur_id = c.id
      where c.id = recorded_by_chauffeur_id
        and c.auth_user_id = (select auth.uid())
        and m.reservation_id = payments.reservation_id
        and m.status in ('assigned','accepted','in_progress')
        and now() between m.starts_at and m.expires_at
    )
  );

create table if not exists public.chauffeur_mission_checklists (
  mission_id uuid not null references public.chauffeur_missions(id) on delete cascade,
  phase text not null check (phase in ('departure','return')),
  submitted_by uuid not null references auth.users(id) on delete restrict,
  checklist jsonb not null default '{}'::jsonb check (jsonb_typeof(checklist) = 'object'),
  photos jsonb not null default '{}'::jsonb check (jsonb_typeof(photos) = 'object'),
  completed_at timestamptz not null default now(),
  primary key (mission_id, phase)
);

alter table public.chauffeur_mission_checklists enable row level security;
revoke all on public.chauffeur_mission_checklists from anon, public;
grant select, insert, update on public.chauffeur_mission_checklists to authenticated;

drop policy if exists chauffeur_mission_checklists_admin_read on public.chauffeur_mission_checklists;
create policy chauffeur_mission_checklists_admin_read on public.chauffeur_mission_checklists
  for select to authenticated
  using (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ));

drop policy if exists chauffeur_mission_checklists_admin_manage on public.chauffeur_mission_checklists;
create policy chauffeur_mission_checklists_admin_manage on public.chauffeur_mission_checklists
  for all to authenticated
  using (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ))
  with check (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ));

drop policy if exists chauffeur_mission_checklists_driver_read on public.chauffeur_mission_checklists;
create policy chauffeur_mission_checklists_driver_read on public.chauffeur_mission_checklists
  for select to authenticated
  using (exists (
    select 1
    from public.chauffeur_missions m
    join public.chauffeurs c on c.id = m.chauffeur_id
    where m.id = chauffeur_mission_checklists.mission_id
      and c.auth_user_id = (select auth.uid())
  ));

drop policy if exists chauffeur_mission_checklists_driver_write on public.chauffeur_mission_checklists;
create policy chauffeur_mission_checklists_driver_write on public.chauffeur_mission_checklists
  for all to authenticated
  using (
    submitted_by = (select auth.uid())
    and exists (
      select 1
      from public.chauffeur_missions m
      join public.chauffeurs c on c.id = m.chauffeur_id
      where m.id = chauffeur_mission_checklists.mission_id
        and c.auth_user_id = (select auth.uid())
        and ((phase = 'departure' and m.status = 'accepted')
          or (phase = 'return' and m.status = 'in_progress'))
    )
  )
  with check (
    submitted_by = (select auth.uid())
    and checklist->>'fuel_percent' ~ '^(100|[0-9]{1,2})$'
    and checklist->>'cash_remaining' ~ '^[0-9]+(\.[0-9]+)?$'
    and checklist->>'driver_behavior' in ('happy','neutral','dangerous')
    and (
      (phase = 'departure'
       and checklist->>'cin_seen' = 'true'
       and checklist->>'license_seen' = 'true'
       and photos ?& array['front','rear','side','wheel','dashboard','cin','license'])
      or
      (phase = 'return'
       and photos ?& array['front','rear','side','wheel','dashboard'])
    )
    and not exists (
      select 1 from jsonb_each_text(photos) photo
      where photo.value !~ ('^' || (select auth.uid())::text || '/' || mission_id::text || '/' || phase || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$')
    )
    and exists (
      select 1
      from public.chauffeur_missions m
      join public.chauffeurs c on c.id = m.chauffeur_id
      where m.id = chauffeur_mission_checklists.mission_id
        and c.auth_user_id = (select auth.uid())
        and ((phase = 'departure' and m.status = 'accepted')
          or (phase = 'return' and m.status = 'in_progress'))
    )
  );

-- Photos CIN/permis et photos véhicule ne sont jamais publiques.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chauffeur-mission-evidence',
  'chauffeur-mission-evidence',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists chauffeur_mission_evidence_driver_upload on storage.objects;
create policy chauffeur_mission_evidence_driver_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chauffeur-mission-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[3] in ('departure','return')
    and exists (
      select 1
      from public.chauffeur_missions m
      join public.chauffeurs c on c.id = m.chauffeur_id
      where m.id::text = (storage.foldername(name))[2]
        and c.auth_user_id = (select auth.uid())
        and m.status in ('accepted','in_progress')
    )
  );

drop policy if exists chauffeur_mission_evidence_private_read on storage.objects;
create policy chauffeur_mission_evidence_private_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chauffeur-mission-evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.account_profiles p
        where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
      )
    )
  );

drop policy if exists chauffeur_mission_evidence_driver_update on storage.objects;
create policy chauffeur_mission_evidence_driver_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'chauffeur-mission-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.chauffeur_missions m
      join public.chauffeurs c on c.id = m.chauffeur_id
      where m.id::text = (storage.foldername(name))[2]
        and c.auth_user_id = (select auth.uid())
        and m.status in ('accepted','in_progress')
    )
  )
  with check (
    bucket_id = 'chauffeur-mission-evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1
      from public.chauffeur_missions m
      join public.chauffeurs c on c.id = m.chauffeur_id
      where m.id::text = (storage.foldername(name))[2]
        and c.auth_user_id = (select auth.uid())
        and m.status in ('accepted','in_progress')
    )
  );

-- Lien wa.me : seul le hash du jeton est conservé en base et chaque lien est utilisable une fois.
create or replace function public.respond_to_chauffeur_mission(
  p_token_hash text,
  p_response text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  if p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_response is null
     or p_response not in ('accept','refuse') then
    return false;
  end if;

  update public.chauffeur_missions
     set status = case when p_response = 'accept' then 'accepted' else 'refused' end,
         responded_at = now(),
         responded_by = null,
         acceptance_token_hash = null,
         updated_at = now()
   where acceptance_token_hash = p_token_hash
     and status = 'assigned'
     and acceptance_expires_at is not null
     and acceptance_expires_at >= now()
     and expires_at >= now();

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$function$;

revoke all on function public.respond_to_chauffeur_mission(text,text) from public;
grant execute on function public.respond_to_chauffeur_mission(text,text) to anon, authenticated;

-- Même action depuis la session du chauffeur; la fonction vérifie la relation au compte Auth.
create or replace function public.respond_to_chauffeur_mission_as_driver(
  p_mission_id uuid,
  p_response text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
begin
  if auth.uid() is null or p_mission_id is null or p_response is null or p_response not in ('accept','refuse') then
    return false;
  end if;

  update public.chauffeur_missions m
     set status = case when p_response = 'accept' then 'accepted' else 'refused' end,
         responded_at = now(),
         responded_by = auth.uid(),
         acceptance_token_hash = null,
         updated_at = now()
   where m.id = p_mission_id
     and m.status = 'assigned'
     and m.expires_at >= now()
     and exists (
       select 1 from public.chauffeurs c
       where c.id = m.chauffeur_id and c.auth_user_id = auth.uid()
     );

  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$function$;

revoke all on function public.respond_to_chauffeur_mission_as_driver(uuid,text) from public, anon;
grant execute on function public.respond_to_chauffeur_mission_as_driver(uuid,text) to authenticated;
