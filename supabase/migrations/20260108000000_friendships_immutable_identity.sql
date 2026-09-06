-- Close a hole in 20260105000000_friendships.sql: the recipient of a request
-- could accept it and rewrite `requested_by` in the same statement, making
-- themselves the sender of a request they had received.
--
-- The original migration granted update on two columns and assumed that
-- narrowed what a client could write:
--
--   grant update (status, responded_at) on table public.friendships to authenticated;
--
-- It did not. Supabase's bootstrap already runs `grant all on all tables in
-- schema public to authenticated`, so a column-scoped grant issued afterwards
-- is additive -- it adds nothing that is not already held. Grants accumulate;
-- a narrower one has to be preceded by a revoke to mean anything at all.
--
-- Row level security did not catch it either, and could not: a policy's
-- `with check` sees only the new row, so it can require the row to end up
-- accepted but cannot say "and requested_by is what it was before".
--
-- Found by the RLS integration test added alongside this migration, which is
-- the whole argument for asserting policies against a real database instead of
-- reading them and agreeing that they look right.

-- 1. Make the column scope real.
revoke update on table public.friendships from authenticated;
grant update (status, responded_at) on table public.friendships to authenticated;

-- 2. Enforce it again in a way that does not depend on grant ordering.
--
-- The revoke above is correct but fragile: anything that later re-runs a broad
-- `grant all` -- a bootstrap script, a restored dump, someone adding a column
-- and re-granting out of habit -- silently reopens it, and nothing fails until
-- somebody notices a rewritten requester. A trigger cannot be undone by a
-- grant, so the two together fix the identity of a friendship at insert time
-- regardless of how privileges drift afterwards.
create or replace function public.friendships_reject_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_a is distinct from old.user_a
     or new.user_b is distinct from old.user_b
     or new.requested_by is distinct from old.requested_by
     or new.created_at is distinct from old.created_at then
    raise exception
      'friendship identity is immutable: user_a, user_b, requested_by and created_at cannot be changed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

comment on function public.friendships_reject_identity_change() is
  'Pins who a friendship is between and who asked. Accepting may change status and responded_at, nothing else.';

create trigger friendships_identity_is_immutable
  before update on public.friendships
  for each row
  execute function public.friendships_reject_identity_change();
