alter table public.site_ads add column if not exists description text;
alter table public.site_ads add column if not exists cta_label text not null default 'Découvrir l’offre';
