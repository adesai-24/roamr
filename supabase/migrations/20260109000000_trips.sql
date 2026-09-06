-- Trips: an optional, user-named grouping of moments.
--
-- Deliberately not a place. The README is explicit that a trip is free text --
-- "July 4th trip", "Pinnacles trip" -- and can span moments in several cities,
-- so it carries no city_id and is never geocoded. Canonical trip destinations
-- are listed as out of scope for v1.
--
-- This gives the second way of browsing your own history that the README says
-- falls out for free: by city, or by trip, without either view cancelling the
-- other out. A moment keeps its city collection whether or not it is in a trip.

create table public.trips (
  id uuid primary key default gen_random_uuid(),

  owner_id uuid not null references auth.users (id) on delete cascade,

  name text not null,

  -- Both optional. Plenty of trips get named long after the fact, when nobody
  -- remembers the dates, and demanding them would just produce invented ones.
  starts_on date,
  ends_on date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint trips_name_length check (char_length(btrim(name)) between 1 and 100),
  constraint trips_dates_ordered check (
    starts_on is null or ends_on is null or starts_on <= ends_on
  ),

  -- Not redundant with the primary key. It is what lets `moments` reference
  -- (trip_id, user_id) as a pair, which is how "your moment in someone else's
  -- trip" becomes unrepresentable rather than merely unlikely. The same shape
  -- the moments table already uses for user_cities.
  constraint trips_id_owner_unique unique (id, owner_id)
);

comment on table public.trips is
  'A user-named grouping of moments. Free text, may span cities, never geocoded.';
comment on column public.trips.name is
  'Free text by design. Canonical trip destinations are out of scope for v1.';

create index trips_owner_recent_idx on public.trips (owner_id, created_at desc);

create or replace function public.trips_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trips_set_updated_at
  before update on public.trips
  for each row
  execute function public.trips_set_updated_at();

-- ---------------------------------------------------------------------------
-- The link from a moment to its trip.
--
-- Nullable, and `on delete set null`: deleting a trip must ungroup its moments,
-- never destroy them. The photos are the thing people care about; the grouping
-- is a label over the top of them.
-- ---------------------------------------------------------------------------
alter table public.moments
  add column trip_id uuid references public.trips (id) on delete set null;

comment on column public.moments.trip_id is
  'Optional grouping. Null is the normal case; a moment always has a city, only sometimes a trip.';

-- Partial: most moments are not in a trip, and this index only ever serves
-- queries that name one.
create index moments_trip_idx on public.moments (trip_id) where trip_id is not null;

-- A single-column foreign key, unlike the composite one used for user_cities,
-- because `on delete set null` nulls *every* column in the key -- and user_id
-- is not nullable, so a composite key here could not use it. Same-owner is
-- therefore enforced by the trigger below instead.
--
-- The trigger is in some ways the stronger of the two: a policy is bypassed by
-- the service role, and this is not.
create or replace function public.moments_reject_foreign_trip()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trip_id is not null and not exists (
    select 1
    from public.trips t
    where t.id = new.trip_id
      and t.owner_id = new.user_id
  ) then
    raise exception 'a moment can only be filed into a trip owned by the same person'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger moments_trip_must_be_owned
  before insert or update of trip_id, user_id on public.moments
  for each row
  execute function public.moments_reject_foreign_trip();

alter table public.trips enable row level security;

-- Visible to the owner and to the owner's friends, which is the same audience
-- as the moments inside it. A trip that were visible more widely than its
-- contents would leak the shape of somebody's travel through its name alone.
create policy "trips are readable by their owner and their friends"
  on public.trips
  for select
  to authenticated
  using (
    (select auth.uid()) = owner_id
    or public.are_friends((select auth.uid()), owner_id)
  );

create policy "people can create their own trips"
  on public.trips
  for insert
  to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "people can edit their own trips"
  on public.trips
  for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "people can delete their own trips"
  on public.trips
  for delete
  to authenticated
  using ((select auth.uid()) = owner_id);

grant select, insert, delete on table public.trips to authenticated;

-- Revoke before granting: Supabase's bootstrap already grants all on every
-- table in public to authenticated, so a column-scoped grant on its own adds
-- nothing. Learned from 20260108000000_friendships_immutable_identity.sql,
-- where exactly this mistake let a column be rewritten.
revoke update on table public.trips from authenticated;
grant update (name, starts_on, ends_on, updated_at) on table public.trips to authenticated;

-- Anonymous visitors have no business here in v1. There is no public trip view.
revoke all on table public.trips from anon;
