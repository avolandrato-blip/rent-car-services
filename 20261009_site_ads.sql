create table if not exists public.site_ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  image_url text not null,
  target_url text,
  alt_text text not null default 'Publicité',
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.site_ads enable row level security;
drop policy if exists site_ads_public_read on public.site_ads;
create policy site_ads_public_read on public.site_ads for select to anon, authenticated using (active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now()));
drop policy if exists site_ads_admin_read on public.site_ads;
create policy site_ads_admin_read on public.site_ads for select to authenticated using (true);
drop policy if exists site_ads_admin_insert on public.site_ads;
create policy site_ads_admin_insert on public.site_ads for insert to authenticated with check (true);
drop policy if exists site_ads_admin_update on public.site_ads;
create policy site_ads_admin_update on public.site_ads for update to authenticated using (true) with check (true);
drop policy if exists site_ads_admin_delete on public.site_ads;
create policy site_ads_admin_delete on public.site_ads for delete to authenticated using (true);
insert into storage.buckets (id, name, public) values ('site-ads', 'site-ads', true) on conflict (id) do update set public = true;
drop policy if exists site_ads_storage_public_read on storage.objects;
create policy site_ads_storage_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'site-ads');
drop policy if exists site_ads_storage_admin_insert on storage.objects;
create policy site_ads_storage_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'site-ads');
drop policy if exists site_ads_storage_admin_update on storage.objects;
create policy site_ads_storage_admin_update on storage.objects for update to authenticated using (bucket_id = 'site-ads') with check (bucket_id = 'site-ads');
drop policy if exists site_ads_storage_admin_delete on storage.objects;
create policy site_ads_storage_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'site-ads');
