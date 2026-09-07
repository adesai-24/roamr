-- Friendships.

create table public.friendships (
  -- Canonically ordered: user_a is always the smaller uuid.
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,

  -- Which of the two sent it.
  requested_by uuid not null references auth.users (id) on delete cascade,

  status text not null default 'pending',

  created_at timestamptz not null default now(),
  responded_at timestamptz,

  primary key (user_a, user_b),

  -- Strict less-than, so it also rules out self-friendship.
  constraint friendships_canonical_order check (user_a < user_b),
  constraint friendships_requester_is_participant
    check (requested_by in (user_a, user_b)),
  constraint friendships_status check (status in ('pending', 'accepted')),

  -- An accepted row records when; a pending one has nothing to record yet.
  constraint friendships_responded_at_matches_status
    check ((status = 'accepted') = (responded_at is not null))
);

comment on table public.friendships is
  'One row per pair, ordered so user_a < user_b. Mutual by construction.';
comment on column public.friendships.requested_by is
  'Who sent the request. Must be one of the two participants.';

-- The primary key already serves lookups anchored on user_a.
create index friendships_user_b_idx on public.friendships (user_b);

-- Rendering the incoming-requests inbox: pending rows the caller did not send.
create index friendships_pending_idx
  on public.friendships (status, requested_by)
  where status = 'pending';

-- are_friends: the single source of truth for "can these two see each other's things".
create or replace function public.are_friends(user_one uuid, user_two uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and f.user_a = least(user_one, user_two)
      and f.user_b = greatest(user_one, user_two)
  );
$$;

comment on function public.are_friends(uuid, uuid) is
  'True when the two users have an accepted friendship. The only friendship check in the codebase; call it from RLS rather than re-deriving.';

-- Executable by signed-in callers only.
revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

alter table public.friendships enable row level security;

-- You can see a friendship only if you are in it.
create policy "participants can read their own friendships"
  on public.friendships
  for select
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- Sending a request.
create policy "people can send a friend request"
  on public.friendships
  for insert
  to authenticated
  with check (
    (select auth.uid()) in (user_a, user_b)
    and requested_by = (select auth.uid())
    and status = 'pending'
    and responded_at is null
  );

-- Accepting.
create policy "the recipient can accept a pending request"
  on public.friendships
  for update
  to authenticated
  using (
    (select auth.uid()) in (user_a, user_b)
    and status = 'pending'
    and requested_by <> (select auth.uid())
  )
  with check (status = 'accepted' and responded_at is not null);

-- One policy covers declining.
create policy "either participant can remove the friendship"
  on public.friendships
  for delete
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

grant select, insert, delete on table public.friendships to authenticated;

-- Column-scoped update grant.
grant update (status, responded_at) on table public.friendships to authenticated;

revoke all on table public.friendships from anon;
