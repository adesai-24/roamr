-- Moments and the per-user city collections they land in.

create table public.user_cities (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,

  -- `restrict` rather than `cascade`.
  city_id uuid not null references public.cities (id) on delete restrict,

  -- Maintained entirely by trigger (see below).
  moment_count integer not null default 0,
  first_moment_at timestamptz,
  last_moment_at timestamptz,
  cover_photo_path text,

  created_at timestamptz not null default now(),

  constraint user_cities_user_city_unique unique (user_id, city_id),

  -- The composite key `moments` points at.
  constraint user_cities_id_user_unique unique (id, user_id),

  constraint user_cities_moment_count_non_negative check (moment_count >= 0)
);

comment on table public.user_cities is
  'A user''s running collection for one city. Created on demand by their first Moment there; grows forever after.';
comment on column public.user_cities.moment_count is
  'Trigger-maintained. Recomputed from moments, never incremented by application code.';
comment on column public.user_cities.cover_photo_path is
  'Storage object path of the most recent moment, denormalised so the places list is one query instead of one per city.';

-- The places list: a person's cities, most recent first.
create index user_cities_user_recent_idx
  on public.user_cities (user_id, last_moment_at desc nulls last);

create table public.moments (
  id uuid primary key default gen_random_uuid(),

  -- Denormalised from user_cities on purpose.
  user_id uuid not null references auth.users (id) on delete cascade,
  user_city_id uuid not null,

  -- A Storage object path, never a URL.
  photo_path text not null,

  -- Stored so a grid can reserve the right space before the image arrives.
  width integer not null,
  height integer not null,

  caption text,

  taken_at timestamptz not null default now(),

  -- The optional pin.
  pin_lat double precision,
  pin_lng double precision,

  -- Derived from the pair above so the point can never disagree with the numbers.
  pin_geom extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(pin_lng, pin_lat), 4326)::extensions.geography
  ) stored,

  -- Friends-only is the default, as it is for profiles.
  visibility text not null default 'friends',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A moment belongs to a collection *and* that collection has to be the owner's.
  constraint moments_user_city_fk
    foreign key (user_city_id, user_id)
    references public.user_cities (id, user_id)
    on delete cascade,

  -- The storage path is scoped by owner, and this is what enforces it.
  constraint moments_photo_path_owned check (photo_path like (user_id::text || '/%')),

  -- One object, one moment.
  constraint moments_photo_path_unique unique (photo_path),

  constraint moments_visibility_check check (visibility in ('friends', 'public')),
  constraint moments_dimensions_positive check (width > 0 and height > 0),
  constraint moments_caption_length check (caption is null or char_length(caption) <= 500),

  -- Half a pin is not a pin.
  constraint moments_pin_paired check ((pin_lat is null) = (pin_lng is null)),
  constraint moments_pin_lat_valid check (pin_lat is null or (pin_lat between -90 and 90)),
  constraint moments_pin_lng_valid check (pin_lng is null or (pin_lng between -180 and 180))
);

comment on table public.moments is
  'One photo in a user''s city collection. Friends-only unless visibility is explicitly public.';
comment on column public.moments.photo_path is
  'Storage object path under the moment-photos bucket, always prefixed with the owner''s uuid. Never a URL.';
comment on column public.moments.taken_at is
  'EXIF capture time where the file had one, upload time otherwise. Orders the collection.';
comment on column public.moments.visibility is
  'friends (default) or public. The public path has no UI yet -- see the read policies below.';

-- A city's collection, in the order the page renders it.
create index moments_user_city_taken_idx on public.moments (user_city_id, taken_at desc);

-- The friends feed.
create index moments_user_created_idx on public.moments (user_id, created_at desc);

-- Challenge proximity matching scans pinned moments in a later PR.
create index moments_pin_geom_idx
  on public.moments using gist (pin_geom)
  where pin_geom is not null;

create or replace function public.moments_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger moments_set_updated_at
  before update on public.moments
  for each row
  execute function public.moments_set_updated_at();

-- Collection counters.
create or replace function public.user_cities_refresh_counters(target_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.user_cities uc
  set moment_count = agg.moment_count,
      first_moment_at = agg.first_moment_at,
      last_moment_at = agg.last_moment_at,
      cover_photo_path = agg.cover_photo_path
  from (
    select
      t.id,
      stats.moment_count,
      stats.first_moment_at,
      stats.last_moment_at,
      cover.photo_path as cover_photo_path
    -- distinct because an update that leaves the city unchanged passes the same id twice.
    from (select distinct u.id from unnest(target_ids) as u (id)) t
    cross join lateral (
      select
        count(*) as moment_count,
        min(m.taken_at) as first_moment_at,
        max(m.taken_at) as last_moment_at
      from public.moments m
      where m.user_city_id = t.id
    ) stats
    -- The cover is the newest photo.
    left join lateral (
      select m.photo_path
      from public.moments m
      where m.user_city_id = t.id
      order by m.taken_at desc, m.created_at desc, m.id desc
      limit 1
    ) cover on true
  ) agg
  where uc.id = agg.id;
$$;

comment on function public.user_cities_refresh_counters(uuid[]) is
  'Recomputes moment_count, the date range and the cover photo for the given collections. Trigger-only; not callable by clients.';

-- Not callable by any client role.
revoke all on function public.user_cities_refresh_counters(uuid[]) from public;

-- security definer is required.
create or replace function public.moments_sync_user_city_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Spelled out per operation rather than folded into one expression.
  if tg_op = 'INSERT' then
    perform public.user_cities_refresh_counters(array[new.user_city_id]);
  elsif tg_op = 'DELETE' then
    perform public.user_cities_refresh_counters(array[old.user_city_id]);
  else
    perform public.user_cities_refresh_counters(array[old.user_city_id, new.user_city_id]);
  end if;
  return null;
end;
$$;

create trigger moments_sync_counters_on_write
  after insert or delete on public.moments
  for each row
  execute function public.moments_sync_user_city_counters();

-- Split from the trigger above so it can carry a WHEN clause.
create trigger moments_sync_counters_on_move
  after update on public.moments
  for each row
  when (
    old.user_city_id is distinct from new.user_city_id
    or old.taken_at is distinct from new.taken_at
    or old.photo_path is distinct from new.photo_path
  )
  execute function public.moments_sync_user_city_counters();

-- Row level security

alter table public.user_cities enable row level security;

-- Your own collections.
create policy "collections are readable by their owner and their friends"
  on public.user_cities
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or public.are_friends((select auth.uid()), user_id)
  );

create policy "people can start their own collections"
  on public.user_cities
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Deliberately no update or delete policy.

grant select, insert on table public.user_cities to authenticated;
revoke all on table public.user_cities from anon;

alter table public.moments enable row level security;

-- Owner, friends, or, once the moment is explicitly public, anyone signed in.
create policy "moments are readable by their owner and their friends"
  on public.moments
  for select
  to authenticated
  using (
    visibility = 'public'
    or (select auth.uid()) = user_id
    or public.are_friends((select auth.uid()), user_id)
  );

-- The logged-out half of the same rule.
create policy "public moments are readable by anyone"
  on public.moments
  for select
  to anon
  using (visibility = 'public');

-- Writes are owner-only, in all three directions.
create policy "people can add their own moments"
  on public.moments
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- USING and WITH CHECK both name the owner.
create policy "people can edit their own moments"
  on public.moments
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "people can delete their own moments"
  on public.moments
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

grant select, insert, delete on table public.moments to authenticated;

-- Column-scoped update grant, following the same reasoning as friendships.
grant update (caption, taken_at, pin_lat, pin_lng, visibility, user_city_id)
  on table public.moments to authenticated;

-- anon gets select only, and RLS narrows that to public moments.
grant select on table public.moments to anon;

-- Photo storage Private, always.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moment-photos', 'moment-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

-- No storage policies, deliberately, not an omission.
