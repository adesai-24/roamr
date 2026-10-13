-- Canonical cities.

create table public.cities (
  id uuid primary key default gen_random_uuid(),

  -- Place ids are only unique within the geocoder that issued them.
  provider text not null,
  provider_place_id text not null,

  name text not null, -- "Chicago"
  admin1 text, -- "Illinois"; nullable because plenty of places have no state/region
  country_code text, -- "US"; ISO 3166-1 alpha-2, nullable for the same reason
  display_name text not null, -- "Chicago, Illinois"

  lat double precision not null,
  lng double precision not null,

  -- Derived, never written by the application.
  geom extensions.geography(Point, 4326) generated always as (
    extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography
  ) stored,

  created_at timestamptz not null default now(),

  -- A backstop.
  constraint cities_lat_valid check (lat >= -90 and lat <= 90),
  constraint cities_lng_valid check (lng >= -180 and lng <= 180),

  constraint cities_provider_place_unique unique (provider, provider_place_id)
);

comment on table public.cities is
  'Canonical places resolved via geocoding. Deduped on (provider, provider_place_id) so every user''s "Chicago" is one row.';
comment on column public.cities.geom is
  'Generated from lng/lat. Indexed with GiST for proximity queries (challenge target matching).';

-- Proximity matching against challenge targets scans this in a later PR.
create index cities_geom_idx on public.cities using gist (geom);

-- No further indexes.

alter table public.cities enable row level security;

-- Cities are non-sensitive canonical reference data.
create policy cities_select_all on public.cities
  for select
  to authenticated, anon
  using (true);

-- Deliberately no insert/update/delete policy.
