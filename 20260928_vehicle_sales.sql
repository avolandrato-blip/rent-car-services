create table if not exists public.vehicle_sales (
  id uuid primary key default gen_random_uuid(),
  seller_name text not null,
  seller_phone text not null,
  seller_email text,
  seller_address text,
  make text not null,
  model text not null,
  year integer,
  asking_price numeric,
  mileage_km integer,
  description text,
  repairs_needed text,
  transmission text,
  fuel text,
  seats integer,
  photo_urls jsonb not null default '{}'::jsonb,
  registration_card_status text not null default 'unknown' check (registration_card_status in ('yes','no','unknown')),
  insurance_status text not null default 'unknown' check (insurance_status in ('yes','no','unknown')),
  inspection_status text not null default 'unknown' check (inspection_status in ('yes','no','unknown')),
  pink_card_status text not null default 'unknown' check (pink_card_status in ('yes','no','unknown')),
  model_1_status text not null default 'unknown' check (model_1_status in ('yes','no','unknown')),
  status text not null default 'new' check (status in ('new','contacted','accepted','rejected','archived')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicle_sales enable row level security;
drop policy if exists vehicle_sales_public_insert on public.vehicle_sales;
create policy vehicle_sales_public_insert on public.vehicle_sales for insert to anon, authenticated with check (true);
drop policy if exists vehicle_sales_authenticated_read on public.vehicle_sales;
create policy vehicle_sales_authenticated_read on public.vehicle_sales for select to authenticated using (true);
drop policy if exists vehicle_sales_authenticated_update on public.vehicle_sales;
create policy vehicle_sales_authenticated_update on public.vehicle_sales for update to authenticated using (true) with check (true);

insert into storage.buckets (id, name, public)
values ('vehicle-sales', 'vehicle-sales', true)
on conflict (id) do update set public = true;

drop policy if exists vehicle_sales_photo_public_insert on storage.objects;
create policy vehicle_sales_photo_public_insert on storage.objects for insert to anon, authenticated with check (bucket_id = 'vehicle-sales');
drop policy if exists vehicle_sales_photo_public_read on storage.objects;
create policy vehicle_sales_photo_public_read on storage.objects for select to anon, authenticated using (bucket_id = 'vehicle-sales');
drop policy if exists vehicle_sales_photo_authenticated_delete on storage.objects;
create policy vehicle_sales_photo_authenticated_delete on storage.objects for delete to authenticated using (bucket_id = 'vehicle-sales');
