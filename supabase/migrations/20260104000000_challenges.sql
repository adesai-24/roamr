-- Challenges: curated collections of places, checked off one at a time.
--
-- A challenge ("All 63 US National Parks", "New7Wonders") is a personal
-- checklist. It is deliberately NOT a competition: there is no completion
-- counter shared across users, no rank, no leaderboard, and no table here that
-- can answer "who is furthest along". Progress is per user and, in a later PR,
-- visible to that user's friends -- never ordered. See README "Design
-- principles"; this shape is the enforcement of it, not an oversight.

-- postgis is installed into the `extensions` schema (20260101000000), which is
-- not on the default search_path a migration runs with. Put it there for the
-- geography type and its operators below, and hand it back at the end of the
-- file so nothing later in the session inherits it.
set search_path = public, extensions;

-- The catalog itself: public reference data, written only by seeds.
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  description text,
  category text,
  cover_path text,
  -- Derived from challenge_targets by the seeds rather than hand-maintained,
  -- so it cannot drift when the catalog grows.
  target_count int not null default 0,
  is_active boolean not null default true,
  sort_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.challenges is
  'Curated collections of places to visit. Public reference data, seeded as service role.';
comment on column public.challenges.target_count is
  'Recomputed from challenge_targets by the seeds. Never hand-written.';

-- One place inside a challenge.
--
-- match_mode is the central design decision here. The three challenges in the
-- v1 catalog cannot be matched the same way:
--
--   'radius'  a point plus a per-target radius. "Was this photo taken inside
--             Yosemite" is a distance question.
--   'admin1'  the first-level administrative area of the city a photo resolved
--             to. "Visit all 50 states" is a name comparison against
--             match_value ('Illinois'); no circle can express a state boundary,
--             and a circle big enough to cover Texas would also swallow four
--             other states.
--   'city'    an exact canonical city match, for targets that are a city.
--
-- Rather than three tables (or a polygon column and the PostGIS-heavy import
-- pipeline it would need), one table carries all three and the matching engine
-- -- a later PR -- branches on match_mode.
create table public.challenge_targets (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  slug text not null,
  name text not null,
  subtitle text,
  lat double precision,
  lng double precision,
  -- Nullable on purpose: an 'admin1' target has no meaningful single point, and
  -- where one is seeded anyway (a state's geographic centre) it is for display,
  -- not for matching. st_makepoint is strict, so a missing coordinate yields
  -- null here rather than a point at (0, 0) off the coast of Africa.
  geom geography(Point, 4326) generated always as (
    st_setsrid(st_makepoint(lng, lat), 4326)::geography
  ) stored,
  match_mode text not null check (match_mode in ('radius', 'admin1', 'city')),
  match_value text,
  -- Per target, not a global constant: Wrangell-St. Elias is larger than
  -- Switzerland and Gateway Arch is 91 acres. One radius for both would either
  -- miss half of Alaska or check off the Arch from three states away.
  radius_m int,
  admin1 text,
  country_code text,
  sort_order int,
  unique (challenge_id, slug),
  -- Lets challenge_completions carry a denormalised challenge_id that cannot
  -- drift from the target's real challenge (see the composite FK below).
  unique (id, challenge_id),
  constraint challenge_targets_lat_range check (lat is null or lat between -90 and 90),
  constraint challenge_targets_lng_range check (lng is null or lng between -180 and 180),
  constraint challenge_targets_radius_needs_point check (
    match_mode <> 'radius'
    or (lat is not null and lng is not null and radius_m is not null and radius_m > 0)
  ),
  constraint challenge_targets_name_match_needs_value check (
    match_mode not in ('admin1', 'city') or match_value is not null
  )
);

comment on column public.challenge_targets.match_mode is
  'How a visit is recognised: radius (point + radius_m), admin1 (state/region name in match_value), or city (canonical city in match_value).';
comment on column public.challenge_targets.radius_m is
  'Match radius in metres, sized per target. Only meaningful for match_mode = radius.';

create index challenge_targets_challenge_id_idx
  on public.challenge_targets (challenge_id, sort_order);
create index challenge_targets_geom_idx
  on public.challenge_targets using gist (geom);
create index challenge_targets_match_value_idx
  on public.challenge_targets (match_mode, match_value)
  where match_value is not null;

-- Opting in. Joining is what puts a challenge on your profile; the catalog is
-- browsable without it.
create table public.user_challenges (
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, challenge_id)
);

create index user_challenges_challenge_id_idx on public.user_challenges (challenge_id);

-- One target, checked off by one user, at most once.
create table public.challenge_completions (
  user_id uuid not null references auth.users (id) on delete cascade,
  challenge_id uuid not null,
  target_id uuid not null,
  -- No foreign key yet: `moments` is being built on a separate branch and does
  -- not exist at this migration. A later PR adds
  -- `references public.moments (id) on delete set null` once it does.
  moment_id uuid,
  -- 'manual' = the user ticked it off; 'suggested' = the matching engine
  -- proposed it from a moment's location and the user accepted.
  source text not null default 'manual' check (source in ('manual', 'suggested')),
  completed_at timestamptz not null default now(),
  primary key (user_id, target_id),
  foreign key (challenge_id) references public.challenges (id) on delete cascade,
  foreign key (target_id, challenge_id)
    references public.challenge_targets (id, challenge_id) on delete cascade
);

create index challenge_completions_user_challenge_idx
  on public.challenge_completions (user_id, challenge_id);
create index challenge_completions_moment_id_idx
  on public.challenge_completions (moment_id)
  where moment_id is not null;

-- A declined suggestion. Without this row the matching engine would re-offer
-- the same target for the same photo on every pass, which is the fastest way to
-- make an automatic suggestion feel like nagging.
create table public.challenge_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references public.challenge_targets (id) on delete cascade,
  -- Same as above: FK to `moments` arrives with a later PR. A null moment_id
  -- means the user dismissed the target outright, not just for one photo.
  moment_id uuid,
  dismissed_at timestamptz not null default now(),
  -- nulls not distinct so a second outright dismissal of the same target
  -- collides instead of stacking up duplicate rows.
  unique nulls not distinct (user_id, target_id, moment_id)
);

create index challenge_dismissals_user_moment_idx
  on public.challenge_dismissals (user_id, moment_id);

-- Row level security -------------------------------------------------------

alter table public.challenges enable row level security;
alter table public.challenge_targets enable row level security;
alter table public.user_challenges enable row level security;
alter table public.challenge_completions enable row level security;
alter table public.challenge_dismissals enable row level security;

-- The catalog is reference data. Readable signed out so a shared challenge link
-- renders before someone has an account. No write policies: seeds run as the
-- service role, which bypasses RLS.
create policy "Challenges are readable by anyone"
  on public.challenges
  for select
  to authenticated, anon
  using (true);

create policy "Challenge targets are readable by anyone"
  on public.challenge_targets
  for select
  to authenticated, anon
  using (true);

-- Progress is owner-only for now.
--
-- Deliberately NOT friends-visible yet: the friend graph and
-- `public.are_friends(a, b)` do not exist until a later PR, and that same PR is
-- where challenge progress becomes visible to friends -- by adding a select
-- policy here, never by widening these. Whatever it adds stays per-user: no
-- policy on these tables may expose several users' progress in a comparable,
-- orderable shape.
create policy "Members read their own challenge memberships"
  on public.user_challenges
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Members join challenges as themselves"
  on public.user_challenges
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Members update their own challenge memberships"
  on public.user_challenges
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Members leave their own challenges"
  on public.user_challenges
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users read their own completions"
  on public.challenge_completions
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users record their own completions"
  on public.challenge_completions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update their own completions"
  on public.challenge_completions
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users remove their own completions"
  on public.challenge_completions
  for delete
  to authenticated
  using (auth.uid() = user_id);

create policy "Users read their own dismissals"
  on public.challenge_dismissals
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users record their own dismissals"
  on public.challenge_dismissals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users update their own dismissals"
  on public.challenge_dismissals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users remove their own dismissals"
  on public.challenge_dismissals
  for delete
  to authenticated
  using (auth.uid() = user_id);

reset search_path;
