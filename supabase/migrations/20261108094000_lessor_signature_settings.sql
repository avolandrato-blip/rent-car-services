create table if not exists public.admin_signature_settings (
  id text primary key check (id = 'lessor'),
  signature_data text not null check (
    length(signature_data) between 100 and 500000
    and signature_data like 'data:image/png;base64,%'
  ),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_signature_settings enable row level security;
revoke all on table public.admin_signature_settings from public, anon, authenticated;
grant select, insert, update on table public.admin_signature_settings to authenticated;

drop policy if exists admin_signature_settings_super_admin_only on public.admin_signature_settings;
create policy admin_signature_settings_super_admin_only
on public.admin_signature_settings
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());
