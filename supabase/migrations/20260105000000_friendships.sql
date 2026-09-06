-- Friendships: the mutual, symmetric edge that every privacy rule in roamr
-- ultimately resolves against.
--
-- A friendship is one thing shared by two people, not two rows pointing at each
-- other. Storing it once, with the pair always ordered the same way, means the
-- database itself forbids the states that a two-row design has to police in
-- application code: A friends with B while B is not friends with A, duplicate
-- requests in opposite directions, or an accept that updates one side only.

create table public.friendships (
  -- Canonically ordered: user_a is always the smaller uuid. The check below is
  -- what makes the primary key a real uniqueness guarantee -- without it,
  -- (A,B) and (B,A) are two distinct keys and the pair can be duplicated.
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,

  -- Which of the two sent it. Needed to render "you requested" versus "they
  -- requested", and to stop a requester from accepting their own request.
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

-- The primary key already serves lookups anchored on user_a. This covers the
-- other direction, which is half of every "who are my friends" query.
create index friendships_user_b_idx on public.friendships (user_b);

-- Rendering the incoming-requests inbox: pending rows the caller did not send.
create index friendships_pending_idx
  on public.friendships (status, requested_by)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- are_friends: the single source of truth for "can these two see each other's
-- things". Every table added from here on calls this from its RLS policy
-- rather than re-deriving the answer, because a privacy rule that is written
-- twice is a privacy rule that will eventually disagree with itself.
--
-- security definer is required, not incidental. This gets called from inside
-- other tables' policies, where the caller cannot select from friendships
-- under its own rights -- and having it read through the caller's RLS would
-- also recurse. It is safe to elevate here because the function returns a
-- single boolean about a pair the caller already named, and leaks no rows.
--
-- The empty search_path is what keeps that elevation from being exploitable:
-- an unqualified `friendships` inside a definer function resolves through the
-- *caller's* search_path, so the caller gets to choose which table it means.
-- ---------------------------------------------------------------------------
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

-- Executable by signed-in callers only. Deliberately not granted to anon: a
-- logged-out visitor is nobody's friend, so any future policy covering public
-- content must gate on the content's own visibility column and must not call
-- this for the anon role -- doing so would raise a permission error rather
-- than returning false, which is a confusing way to discover the mistake.
revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated;

alter table public.friendships enable row level security;

-- You can see a friendship only if you are in it. There is no browsing the
-- graph -- no mutual-friends view, no follower list, nothing that would let one
-- person enumerate another's connections.
create policy "participants can read their own friendships"
  on public.friendships
  for select
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

-- Sending a request. The row must start pending, must name the sender as
-- requester, and the sender must be one of the two people in it -- so nobody
-- can fabricate a friendship between two other accounts, or insert one that is
-- already accepted.
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

-- Accepting. USING sees the row as it was, WITH CHECK the row as it will be,
-- so together these say: only a pending request, only by the person who did
-- not send it, and only into the accepted state.
--
-- Because USING requires status = 'pending', an accepted friendship can never
-- be updated again -- there is no path back to pending, and no way to rewrite
-- who requested it. Unfriending is a delete, not a status change.
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

-- One policy covers declining, cancelling, and unfriending: in every case a
-- participant is removing a row they are part of. Modelling them separately
-- would mean three ways to express the same permission.
create policy "either participant can remove the friendship"
  on public.friendships
  for delete
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));

grant select, insert, delete on table public.friendships to authenticated;

-- Column-scoped update grant. The accept policy already constrains the values,
-- but this makes the narrower point structurally: status and responded_at are
-- the only columns a client may ever write on an existing row, so a future
-- policy cannot accidentally expose requested_by to rewriting.
grant update (status, responded_at) on table public.friendships to authenticated;

revoke all on table public.friendships from anon;
