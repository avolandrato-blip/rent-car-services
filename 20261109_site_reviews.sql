create table if not exists public.site_reviews (
  id uuid primary key default gen_random_uuid(),
  image_url text,
  reviewer_name text not null default 'Client' check (char_length(btrim(reviewer_name)) between 1 and 80),
  reviewer_gender text check (reviewer_gender in ('female', 'male', 'other', 'prefer_not_to_say')),
  rating smallint not null check (rating between 1 and 5),
  review_text text not null check (char_length(btrim(review_text)) between 3 and 1200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_reviews enable row level security;

drop policy if exists site_reviews_public_read on public.site_reviews;
create policy site_reviews_public_read on public.site_reviews
  for select to anon, authenticated using (active = true);

drop policy if exists site_reviews_admin_read on public.site_reviews;
create policy site_reviews_admin_read on public.site_reviews
  for select to authenticated using (true);

drop policy if exists site_reviews_admin_insert on public.site_reviews;
create policy site_reviews_admin_insert on public.site_reviews
  for insert to authenticated with check (true);

drop policy if exists site_reviews_admin_update on public.site_reviews;
create policy site_reviews_admin_update on public.site_reviews
  for update to authenticated using (true) with check (true);

drop policy if exists site_reviews_admin_delete on public.site_reviews;
create policy site_reviews_admin_delete on public.site_reviews
  for delete to authenticated using (true);

insert into storage.buckets (id, name, public)
values ('site-review-photos', 'site-review-photos', true)
on conflict (id) do update set public = true;

drop policy if exists site_review_photos_public_read on storage.objects;
create policy site_review_photos_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'site-review-photos');

drop policy if exists site_review_photos_admin_insert on storage.objects;
create policy site_review_photos_admin_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'site-review-photos');

drop policy if exists site_review_photos_admin_update on storage.objects;
create policy site_review_photos_admin_update on storage.objects
  for update to authenticated using (bucket_id = 'site-review-photos') with check (bucket_id = 'site-review-photos');

drop policy if exists site_review_photos_admin_delete on storage.objects;
create policy site_review_photos_admin_delete on storage.objects
  for delete to authenticated using (bucket_id = 'site-review-photos');
