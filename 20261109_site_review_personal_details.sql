alter table public.site_reviews
  add column if not exists reviewer_name text,
  add column if not exists reviewer_gender text;

update public.site_reviews
set reviewer_name = 'Client'
where reviewer_name is null or btrim(reviewer_name) = '';

alter table public.site_reviews
  alter column reviewer_name set default 'Client',
  alter column reviewer_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_reviews_reviewer_name_length'
      and conrelid = 'public.site_reviews'::regclass
  ) then
    alter table public.site_reviews
      add constraint site_reviews_reviewer_name_length
      check (char_length(btrim(reviewer_name)) between 1 and 80);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'site_reviews_reviewer_gender_allowed'
      and conrelid = 'public.site_reviews'::regclass
  ) then
    alter table public.site_reviews
      add constraint site_reviews_reviewer_gender_allowed
      check (reviewer_gender is null or reviewer_gender in ('female', 'male', 'other', 'prefer_not_to_say'));
  end if;
end $$;

drop policy if exists site_reviews_public_read on public.site_reviews;

create or replace view public.site_reviews_public
with (security_barrier = true) as
select id, image_url, rating, review_text, reviewer_name, created_at
from public.site_reviews
where active = true;

grant select on public.site_reviews_public to anon, authenticated;
