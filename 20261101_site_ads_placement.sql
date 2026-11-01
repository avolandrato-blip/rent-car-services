alter table public.site_ads add column if not exists placement text not null default 'home';
alter table public.site_ads drop constraint if exists site_ads_placement_check;
alter table public.site_ads add constraint site_ads_placement_check check (placement in ('home','fleet'));
