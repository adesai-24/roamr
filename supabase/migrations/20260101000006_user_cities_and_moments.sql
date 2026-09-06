-- UserCity: a user's running collection for a city. Created on first Moment
-- in that city (no discrete "visit" boundary at this level, per README).
create table public.user_cities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  city_id uuid not null references public.cities (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (user_id, city_id)
);

comment on table public.user_cities is
  'A user''s running per-city collection. One row per (user, city), first created alongside that user''s first moment there.';

alter table public.user_cities enable row level security;

create policy "a user can see their own city collection or a friend's"
  on public.user_cities for select
  to authenticated
  using (user_id = (select auth.uid()) or public.are_friends((select auth.uid()), user_id));

create policy "a user can add only to their own city collection"
  on public.user_cities for insert
  to authenticated
  with check (user_id = (select auth.uid()));

-- Moment: a photo with a timestamp, optional caption/pin, belonging to
-- exactly one UserCity, optionally linked to a Trip. `user_id` is
-- denormalized from user_cities so RLS here does not need a subquery/join on
-- every row -- it is enforced to always match user_cities.user_id by the
-- insert policy below plus the FK, never trusted on its own for authorization
-- beyond that check.
create table public.moments (
  id uuid primary key default gen_random_uuid(),
  user_city_id uuid not null references public.user_cities (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  trip_id uuid references public.trips (id) on delete set null,
  photo_path text not null,
  caption text,
  pin_lat double precision,
  pin_lng double precision,
  created_at timestamptz not null default now()
);

comment on table public.moments is
  'A photo moment in one city. photo_path is a private storage object path -- always read via a server-minted signed URL, never a public bucket URL.';

create index moments_user_id_created_at_idx on public.moments (user_id, created_at desc);
create index moments_user_city_id_idx on public.moments (user_city_id);

alter table public.moments enable row level security;

create policy "a user can see their own moments or a friend's"
  on public.moments for select
  to authenticated
  using (user_id = (select auth.uid()) or public.are_friends((select auth.uid()), user_id));

-- The user_cities row referenced must belong to the same user_id being
-- inserted, so a caller cannot forge a moment into someone else's collection
-- by guessing a user_city_id.
create policy "a user can create only their own moments in their own city collection"
  on public.moments for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.user_cities uc
      where uc.id = user_city_id and uc.user_id = (select auth.uid())
    )
  );

create policy "a user can update only their own moments"
  on public.moments for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "a user can delete only their own moments"
  on public.moments for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- Moment co-tagging: friends who were there too. Kept deliberately simple for
-- the demo -- no separate approval flow (README: "doesn't need its own
-- approval flow").
create table public.moment_participants (
  moment_id uuid not null references public.moments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (moment_id, user_id)
);

comment on table public.moment_participants is
  'Friends co-tagged on a moment. A moment''s owner can tag any friend; no separate accept step for the demo.';

alter table public.moment_participants enable row level security;

create policy "a participant, the moment owner, or the owner's friend can see a tag"
  on public.moment_participants for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.moments m
      where m.id = moment_id
        and (m.user_id = (select auth.uid()) or public.are_friends((select auth.uid()), m.user_id))
    )
  );

-- Only the moment's owner can tag someone, and only a friend (or
-- themselves) -- never a stranger.
create policy "only the moment owner can tag a friend on their moment"
  on public.moment_participants for insert
  to authenticated
  with check (
    exists (select 1 from public.moments m where m.id = moment_id and m.user_id = (select auth.uid()))
    and (user_id = (select auth.uid()) or public.are_friends((select auth.uid()), user_id))
  );

create policy "only the moment owner can remove a tag"
  on public.moment_participants for delete
  to authenticated
  using (exists (select 1 from public.moments m where m.id = moment_id and m.user_id = (select auth.uid())));
