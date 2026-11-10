-- Espace team chauffeur : comptes permanents, missions temporaires et paiements tracés.
alter table public.chauffeurs
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists login_name text,
  add column if not exists must_change_password boolean not null default true,
  add column if not exists last_login_at timestamptz;

create unique index if not exists chauffeurs_auth_user_id_uidx
  on public.chauffeurs(auth_user_id) where auth_user_id is not null;
create unique index if not exists chauffeurs_login_name_uidx
  on public.chauffeurs(lower(login_name)) where login_name is not null;

create table if not exists public.chauffeur_missions (
  id uuid primary key default gen_random_uuid(),
  chauffeur_id uuid not null references public.chauffeurs(id) on delete cascade,
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  mission_type text not null check (mission_type in ('delivery','recovery','delivery_and_recovery')),
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed','cancelled','expired')),
  custom_delivery_cost numeric not null default 0 check (custom_delivery_cost >= 0),
  custom_recovery_cost numeric not null default 0 check (custom_recovery_cost >= 0),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  assigned_by uuid references auth.users(id) on delete set null,
  completed_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chauffeur_mission_max_24h check (expires_at <= starts_at + interval '24 hours'),
  constraint chauffeur_mission_valid_window check (expires_at > starts_at)
);

create index if not exists chauffeur_missions_chauffeur_idx on public.chauffeur_missions(chauffeur_id, status, starts_at);
create index if not exists chauffeur_missions_reservation_idx on public.chauffeur_missions(reservation_id);

alter table public.payments
  add column if not exists recorded_by_chauffeur_id uuid references public.chauffeurs(id) on delete set null,
  add column if not exists source text not null default 'admin';

alter table public.chauffeurs enable row level security;
alter table public.chauffeur_missions enable row level security;
alter table public.payments enable row level security;

-- Le chauffeur authentifié ne voit que sa propre fiche.
drop policy if exists chauffeurs_self_read on public.chauffeurs;
create policy chauffeurs_self_read on public.chauffeurs
  for select to authenticated
  using (auth_user_id = (select auth.uid()));

-- Les comptes authentifiés administratifs conservent le fonctionnement existant.
drop policy if exists chauffeur_missions_admin_all on public.chauffeur_missions;
create policy chauffeur_missions_admin_all on public.chauffeur_missions
  for all to authenticated
  using (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ))
  with check (exists (
    select 1 from public.account_profiles p
    where p.user_id = (select auth.uid()) and p.role = 'super_admin' and p.is_active = true
  ));

drop policy if exists chauffeur_missions_self_read on public.chauffeur_missions;
create policy chauffeur_missions_self_read on public.chauffeur_missions
  for select to authenticated
  using (exists (
    select 1 from public.chauffeurs c
    where c.id = chauffeur_id and c.auth_user_id = (select auth.uid())
  ));

drop policy if exists chauffeur_missions_self_update on public.chauffeur_missions;
create policy chauffeur_missions_self_update on public.chauffeur_missions
  for update to authenticated
  using (exists (
    select 1 from public.chauffeurs c
    where c.id = chauffeur_id and c.auth_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.chauffeurs c
    where c.id = chauffeur_id and c.auth_user_id = (select auth.uid())
  ));

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
        and m.status in ('assigned','in_progress')
        and now() between m.starts_at and m.expires_at
    )
  );

-- Limiter les droits de l’app publique sur les nouvelles tables.
revoke all on public.chauffeur_missions from anon;
revoke all on public.payments from anon;
