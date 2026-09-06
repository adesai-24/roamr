-- Cities: canonical places, shared data no individual user owns. Deduped by
-- name+country so everyone's "Chicago" is the same row. Real geocoding is out
-- of scope for the demo (README); resolveCity() searches-or-creates against a
-- small seeded list instead.

create table public.cities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  country text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now(),
  unique (name, country)
);

comment on table public.cities is
  'Canonical city rows, written only via the admin client (see resolveCity()) -- never directly by a user.';

alter table public.cities enable row level security;

-- Every signed-in user needs to search this list when logging a moment, and
-- a city name is not sensitive, so read access is unrestricted.
create policy "cities are readable by any authenticated user"
  on public.cities for select
  to authenticated
  using (true);

-- Deliberately no insert/update/delete policy for `authenticated`: writes go
-- through resolveCity() using the service-role client, which bypasses RLS.
-- A user who wants to "add" a city can only ever search-or-create through
-- that path, never write an arbitrary row directly.
