create table if not exists public.site_settings (
  id boolean primary key default true check (id = true),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_settings enable row level security;
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings for select to anon, authenticated using (true);
drop policy if exists site_settings_admin_insert on public.site_settings;
create policy site_settings_admin_insert on public.site_settings for insert to authenticated with check (true);
drop policy if exists site_settings_admin_update on public.site_settings;
create policy site_settings_admin_update on public.site_settings for update to authenticated using (true) with check (true);

insert into public.site_settings (id, settings)
values (true, '{"header":{"nom":"Rent Car Service","suffixe":"","logo_url":"images/logo.png"},"footer":{"adresse":"67 Ha Nord Ouest, Parking FJKM SALEMA","telephone":"034 91 207 26","whatsapp":"261349120726","nif":"","stat":""},"social_links":{"facebook":"","tiktok":"","instagram":"","maps":""},"seo":{"title":"Rent Car Service | Location de voiture à Antananarivo","description":"Rent Car Service propose la location de voitures avec ou sans chauffeur à Antananarivo et dans les provinces de Madagascar.","canonical":"https://avolandrato-blip.github.io/rent-car-services/"}}'::jsonb)
on conflict (id) do nothing;
