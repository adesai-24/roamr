-- Canonical cities.
--
-- The README's data model calls this out explicitly: everyone's "Chicago" has
-- to be the same entity. Moments, per-user collections and (later) challenge
-- proximity matching all hang off a city id, so a forked duplicate would
-- quietly split one place in two -- your Chicago collection and a friend's
-- Chicago collection would stop being the same place, and nothing would fail
-- loudly enough for anyone to notice.
--
-- The dedupe mechanism is the unique constraint on (provider,
-- provider_place_id). Resolution is an upsert onto that constraint, so two
-- people adding Chicago at the same instant race onto one row instead of
-- creating two. Deduping on a normalised name would have been the obvious
-- alternative and is wrong: "Springfield" is dozens of places, and accents,
-- casing and local spellings make name equality a bad key.

create table public.cities (
  id uuid primary key default gen_random_uuid(),

  -- Place ids are only unique within the geocoder that issued them, so the
  -- provider is part of the key. Swapping or adding a geocoder later inserts
  -- new rows rather than colliding with Mapbox's id namespace.
  provider text not null,
  provider_place_id text not null,

  name text not null, -- "Chicago"
  admin1 text, -- "Illinois"; nullable because plenty of places have no state/region
  country_code text, -- "US"; ISO 3166-1 alpha-2, nullable for the same reason
  display_name text not null, -- "Chicago, Illinois"

  lat double precision not null,
  lng double precision not null,

  -- Derived, never written by the application. Keeping lat/lng as the single
  -- source of truth means the point cannot drift out of sync with the numbers
  -- the geocoder returned.
  --
  -- postgis lives in the `extensions` schema (see 20260101000000_extensions.sql)
  -- and every reference here is schema-qualified on purpose: a generated
  -- expression is resolved once, at create time, and must not depend on
  -- whatever search_path this migration happens to run under.
  geom extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
  ) stored,

  created_at timestamptz not null default now(),

  -- A backstop, not the defence against a swapped [lat, lng] pair: swapping
  -- Tokyo gives a latitude of 139 and is caught here, but swapping Chicago
  -- gives (-87.6, 41.9), which is a valid point in the Southern Ocean and
  -- passes. Order is asserted in the geocoding parser's tests instead; these
  -- bounds only stop a value that could never be a coordinate at all.
  constraint cities_lat_valid check (lat >= -90 and lat <= 90),
  constraint cities_lng_valid check (lng >= -180 and lng <= 180),

  constraint cities_provider_place_unique unique (provider, provider_place_id)
);

comment on table public.cities is
  'Canonical places resolved via geocoding. Deduped on (provider, provider_place_id) so every user''s "Chicago" is one row.';
comment on column public.cities.geom is
  'Generated from lng/lat. Indexed with GiST for proximity queries (challenge target matching).';

-- Proximity matching against challenge targets scans this in a later PR, and a
-- geography distance query without a GiST index degrades to a full table scan.
create index cities_geom_idx on public.cities using gist (geom);

-- No further indexes: the only other access path is a lookup by (provider,
-- provider_place_id), and the unique constraint above already indexes that.

alter table public.cities enable row level security;

-- Cities are non-sensitive canonical reference data: a list of places that
-- exist, carrying nothing about who went where. `anon` is included
-- deliberately -- a Moment shared publicly still has to render "Chicago,
-- Illinois" for a logged-out visitor who has no session to read it with.
create policy cities_select_all on public.cities
  for select
  to authenticated, anon
  using (true);

-- Deliberately no insert/update/delete policy. With RLS enabled and no write
-- policy, the only role that can write is the service role -- which is exactly
-- the intent, and is why resolveCity() reaches for the admin client. Cities are
-- shared data no individual user owns; letting a user write them directly would
-- let one person rename or relocate a place for everybody else.
