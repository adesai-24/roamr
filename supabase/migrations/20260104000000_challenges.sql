-- Challenges: curated collections of places, checked off one at a time.

-- postgis is installed into the `extensions` schema (20260101000000).
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
  -- Derived from challenge_targets by the seeds rather than hand-maintained.
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
create table public.challenge_targets (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  slug text not null,
  name text not null,
  subtitle text,
  lat double precision,
  lng double precision,
  -- Nullable on purpose.
  geom geography(Point, 4326) generated always as (
    st_setsrid(st_makepoint(lng, lat), 4326)::geography
  ) stored,
  match_mode text not null check (match_mode in ('radius', 'admin1', 'city')),
  match_value text,
  -- Per target, not a global constant: Wrangell-St.
  radius_m int,
  admin1 text,
  country_code text,
  sort_order int,
  unique (challenge_id, slug),
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

-- Opting in.
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
  -- No foreign key yet.
  moment_id uuid,
  -- 'manual' = the user ticked it off.
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

-- A declined suggestion.
create table public.challenge_dismissals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references public.challenge_targets (id) on delete cascade,
  -- Same as above: FK to `moments` arrives with a later PR.
  moment_id uuid,
  dismissed_at timestamptz not null default now(),
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

-- The catalog is reference data.
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
