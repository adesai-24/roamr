-- Moments and the per-user city collections they land in.
--
-- This is the README's core loop in table form: a photo goes in, and it joins
-- your running collection for that city. `user_cities` is that collection. It
-- deliberately has no visit boundary, no start and end date, and no trip
-- requirement -- adding a photo from a city you first saw in 2019 extends the
-- same row rather than opening a new one, which is what makes "everywhere I've
-- been to Chicago" a single, growing thing.

create table public.user_cities (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users (id) on delete cascade,

  -- `restrict` rather than `cascade`: cities are canonical reference data that
  -- nothing in the app deletes, and if that ever changed, taking someone's
  -- photo collection down with the city row would be the wrong answer.
  city_id uuid not null references public.cities (id) on delete restrict,

  -- Maintained entirely by trigger (see below). Never written by the app.
  moment_count integer not null default 0,
  first_moment_at timestamptz,
  last_moment_at timestamptz,
  cover_photo_path text,

  created_at timestamptz not null default now(),

  constraint user_cities_user_city_unique unique (user_id, city_id),

  -- The composite key `moments` points at. Redundant as a uniqueness claim --
  -- `id` is already the primary key -- but a foreign key can only reference a
  -- unique constraint, and this is what lets a moment's owner be checked by the
  -- database rather than by whoever wrote the insert. See moments below.
  constraint user_cities_id_user_unique unique (id, user_id),

  constraint user_cities_moment_count_non_negative check (moment_count >= 0)
);

comment on table public.user_cities is
  'A user''s running collection for one city. Created on demand by their first Moment there; grows forever after.';
comment on column public.user_cities.moment_count is
  'Trigger-maintained. Recomputed from moments, never incremented by application code.';
comment on column public.user_cities.cover_photo_path is
  'Storage object path of the most recent moment, denormalised so the places list is one query instead of one per city.';

-- The places list: a person's cities, most recent first. Every row it returns
-- is already in the index, including the sort key.
create index user_cities_user_recent_idx
  on public.user_cities (user_id, last_moment_at desc nulls last);

create table public.moments (
  id uuid primary key default gen_random_uuid(),

  -- Denormalised from user_cities on purpose. Every RLS policy on this table
  -- asks "whose moment is this", and a policy that had to join to answer would
  -- be both slower and easier to get wrong. The composite foreign key below is
  -- what keeps the copy honest.
  user_id uuid not null references auth.users (id) on delete cascade,
  user_city_id uuid not null,

  -- A Storage object path, never a URL. Reads are server-minted signed URLs
  -- (see web/src/lib/moments/photo-url.ts); there is no public bucket.
  photo_path text not null,

  -- Stored so a grid can reserve the right space before the image arrives.
  -- Without them every photo lands at a guessed aspect ratio and the page
  -- reflows as each one loads.
  width integer not null,
  height integer not null,

  caption text,

  -- When the photo was taken, from EXIF where the file carried it and the
  -- upload time otherwise. This -- not created_at -- is what orders a city's
  -- collection, because a holiday uploaded a week later still belongs in the
  -- week it happened.
  taken_at timestamptz not null default now(),

  -- The optional pin. Null is the expected case: most people never set one.
  pin_lat double precision,
  pin_lng double precision,

  -- Derived from the pair above so the point can never disagree with the
  -- numbers. Schema-qualified for the same reason as cities.geom: a generated
  -- expression is resolved once, at create time, and must not depend on the
  -- search_path this migration happens to run under. st_makepoint is strict, so
  -- a moment with no pin gets a null geometry rather than a point at (0,0).
  pin_geom extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(pin_lng, pin_lat), 4326)::extensions.geography
  ) stored,

  -- Friends-only is the default, as it is for profiles. 'public' is a
  -- deliberate per-moment opt-in.
  visibility text not null default 'friends',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- A moment belongs to a collection *and* that collection has to be the
  -- owner's. Referencing (id, user_id) makes that a structural guarantee: there
  -- is no insert that files your photo into somebody else's Chicago, whatever
  -- the application code does.
  constraint moments_user_city_fk
    foreign key (user_city_id, user_id)
    references public.user_cities (id, user_id)
    on delete cascade,

  -- The storage path is scoped by owner, and this is what enforces it. Without
  -- it a client could point a moment it owns at another user's object and read
  -- their photo through its own signed URL -- the one hole a private bucket
  -- plus server-side signing would otherwise still leave open.
  constraint moments_photo_path_owned check (photo_path like (user_id::text || '/%')),

  -- One object, one moment. This is what makes "delete the moment, delete the
  -- object" safe: no second row can be left pointing at bytes that are gone.
  constraint moments_photo_path_unique unique (photo_path),

  constraint moments_visibility_check check (visibility in ('friends', 'public')),
  constraint moments_dimensions_positive check (width > 0 and height > 0),
  constraint moments_caption_length check (caption is null or char_length(caption) <= 500),

  -- Half a pin is not a pin. Storing one coordinate without the other would
  -- produce a null geometry and a column that looks set but is not.
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

-- The friends feed, which a later PR adds: reverse-chronological by author,
-- which is also the shape every RLS check on this table filters by.
create index moments_user_created_idx on public.moments (user_id, created_at desc);

-- Challenge proximity matching scans pinned moments in a later PR. Partial
-- because the overwhelming majority of moments have no pin, and indexing all
-- those nulls would just make the index bigger for no lookup.
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

-- ---------------------------------------------------------------------------
-- Collection counters.
--
-- These are maintained by trigger rather than by the server action that writes
-- a moment, because a counter kept by application code is only correct while
-- every writer remembers to keep it correct -- and the writers that forget are
-- the ones added later, by someone who did not know the counter existed.
--
-- The trigger recomputes the whole aggregate from `moments` instead of applying
-- a delta. Deltas are where counter bugs live: a moment moving between cities
-- is two adjustments that have to agree, a delete during a cascade may not run
-- in the order you assumed, and any single missed event leaves a number that is
-- wrong forever with nothing to detect it. A recompute has no such state -- it
-- cannot drift, only be temporarily stale inside a transaction that then
-- finishes. The cost is proportional to one user's moments in one city, which
-- is a number in the tens.
-- ---------------------------------------------------------------------------
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
    -- distinct because an update that leaves the city unchanged passes the same
    -- id twice, and a duplicate row here would double every count below.
    from (select distinct u.id from unnest(target_ids) as u (id)) t
    cross join lateral (
      select
        count(*) as moment_count,
        min(m.taken_at) as first_moment_at,
        max(m.taken_at) as last_moment_at
      from public.moments m
      where m.user_city_id = t.id
    ) stats
    -- The cover is the newest photo. created_at and id break ties so two
    -- moments sharing a taken_at cannot make the cover flip between reads.
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

-- Not callable by any client role. The only caller is the trigger below, which
-- runs as the owner and so does not need the grant.
revoke all on function public.user_cities_refresh_counters(uuid[]) from public;

-- security definer is required, not incidental: the counter columns are
-- deliberately not writable by anyone through RLS (there is no update policy on
-- user_cities at all), so the trigger has to run with the table owner's rights
-- to touch them. The empty search_path plus fully-qualified names is what keeps
-- that elevation from being exploitable.
create or replace function public.moments_sync_user_city_counters()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Spelled out per operation rather than folded into one expression, because
  -- OLD is unassigned on INSERT and NEW on DELETE, and reaching for the wrong
  -- one is a runtime error rather than a null.
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

-- Split from the trigger above so it can carry a WHEN clause: a caption edit
-- changes nothing a counter tracks, and re-aggregating on every such edit would
-- be work with no result. A move between cities and a corrected capture time
-- both do change one, so both are listed.
create trigger moments_sync_counters_on_move
  after update on public.moments
  for each row
  when (
    old.user_city_id is distinct from new.user_city_id
    or old.taken_at is distinct from new.taken_at
    or old.photo_path is distinct from new.photo_path
  )
  execute function public.moments_sync_user_city_counters();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.user_cities enable row level security;

-- Your own collections, plus your friends' -- the same rule as the moments
-- inside them, so a join between the two can never return a moment whose city
-- is invisible. public.are_friends() is the only friendship check, per
-- CLAUDE.md; nothing here re-derives it.
--
-- No anon policy. A collection is a list of everywhere one person has been,
-- which is not something a `public` moment should imply consent to publish. The
-- public read path below covers a single moment only, and when it grows a UI,
-- the city name it needs will come from the server rather than from this table.
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

-- Deliberately no update or delete policy. Every column worth changing is
-- trigger-maintained, and a collection is emptied by deleting its moments --
-- which is the path that also removes the stored photos. A delete policy here
-- would cascade the moments away and orphan their objects in the bucket.
-- The places list hides collections whose count has fallen to zero.

grant select, insert on table public.user_cities to authenticated;
revoke all on table public.user_cities from anon;

alter table public.moments enable row level security;

-- Owner, friends, or -- once the moment is explicitly public -- anyone signed
-- in. The visibility test comes first so the common friends-only case does not
-- pay for a function call it cannot need.
create policy "moments are readable by their owner and their friends"
  on public.moments
  for select
  to authenticated
  using (
    visibility = 'public'
    or (select auth.uid()) = user_id
    or public.are_friends((select auth.uid()), user_id)
  );

-- The logged-out half of the same rule, and the reason it is a separate policy:
-- public.are_friends() is deliberately not granted to `anon` (see
-- 20260105000000_friendships.sql), because a logged-out visitor is nobody's
-- friend. Calling it here would raise a permission error rather than returning
-- false. So this policy gates on the moment's own visibility column alone.
--
-- Nothing in the app sets visibility to 'public' yet -- there is no UI for it,
-- and that lands in a later PR. The policy is written now anyway so the column
-- means something the day it is exposed, rather than being a flag that silently
-- does nothing until somebody remembers to add the rule.
create policy "public moments are readable by anyone"
  on public.moments
  for select
  to anon
  using (visibility = 'public');

-- Writes are owner-only, in all three directions. The insert check pins
-- user_id to the caller; the composite foreign key above then pins the
-- collection to the same person.
create policy "people can add their own moments"
  on public.moments
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- USING and WITH CHECK both name the owner, so a moment cannot be handed to
-- somebody else by rewriting user_id.
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

-- Column-scoped update grant, following the same reasoning as friendships. The
-- update policy above already pins the owner, but this makes the narrower point
-- structurally: photo_path, width and height describe an object that has
-- already been uploaded, so there is no edit that should ever rewrite them --
-- and a future policy written loosely cannot accidentally allow it.
grant update (caption, taken_at, pin_lat, pin_lng, visibility, user_city_id)
  on table public.moments to authenticated;

-- anon gets select only, and RLS narrows that to public moments. The grant is
-- what the policy above needs in order to apply at all.
grant select on table public.moments to anon;

-- ---------------------------------------------------------------------------
-- Photo storage
--
-- Private, always. The bucket is created here rather than in config.toml so it
-- exists identically on a hosted project and on a `supabase db reset`.
--
-- The mime allow-list is narrow because the client re-encodes every upload to
-- JPEG before it leaves the browser; anything else arriving is a client that
-- has gone off-script. The size limit is generous for a 2048px JPEG and mean
-- enough to stop somebody parking a video in the bucket.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('moment-photos', 'moment-photos', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

-- No storage policies, deliberately -- not an omission.
--
-- Storage policies are expressed against the object path, and the rule that
-- matters here is "readable by the owner's friends", which lives in
-- public.are_friends() and in the moments row. Reproducing it against a path
-- would mean the same privacy rule written in two places, and two copies of a
-- privacy rule eventually disagree. So `authenticated` and `anon` are given no
-- access to these objects at all: reads are short-TTL signed URLs minted
-- server-side after the row has been read under the caller's own policies, and
-- uploads go to a signed upload URL the server issues for a path it chose. Both
-- paths run through the service role, which policies do not apply to.
