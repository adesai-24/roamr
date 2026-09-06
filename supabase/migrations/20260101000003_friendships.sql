-- Friendship: mutual request/accept between two profiles. Binary for now --
-- no "close friends" tier (see README's out-of-scope list).

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friendships_no_self_friend check (requester_id <> addressee_id)
);

comment on table public.friendships is
  'A request/accept relationship between two profiles. The only source of truth for friendship -- see public.are_friends().';

create index friendships_addressee_idx on public.friendships (addressee_id);

-- One relationship per pair, regardless of who sent the request. Without
-- this, A->B and B->A could both exist as separate rows. A plain table
-- UNIQUE constraint can't take expressions, so this needs to be a unique
-- index on least()/greatest() of the pair instead.
create unique index friendships_unique_pair_idx
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.friendships enable row level security;

create policy "a user can see friendships they are part of"
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy "a user can request a friendship from themselves"
  on public.friendships for insert
  to authenticated
  with check (requester_id = (select auth.uid()));

-- Only the addressee can act on a pending request (accept it). The requester
-- cannot self-accept, and cannot rewrite a request they already sent.
create policy "the addressee can accept a request addressed to them"
  on public.friendships for update
  to authenticated
  using (addressee_id = (select auth.uid()))
  with check (addressee_id = (select auth.uid()));

-- public.are_friends() is THE ONLY place "are these two users friends" logic
-- lives (CLAUDE.md non-negotiable #2). Every RLS policy and every server
-- action that needs a friendship check calls this function -- never a direct
-- query against `friendships`, and never a re-implementation in TypeScript.
--
-- security definer + a pinned search_path: this runs inside RLS policies on
-- other tables (moments, user_cities, ...), where the caller may not have
-- select access to both sides of the friendship row, so it must read
-- `friendships` with the function owner's privileges rather than the
-- caller's.
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b)
        or (f.requester_id = b and f.addressee_id = a))
  );
$$;

comment on function public.are_friends(uuid, uuid) is
  'The only friendship check in the system. Never re-derive this in TypeScript or a new RLS policy.';

revoke all on function public.are_friends(uuid, uuid) from public;
grant execute on function public.are_friends(uuid, uuid) to authenticated, service_role;
