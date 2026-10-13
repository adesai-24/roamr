-- Close a hole in 20260105000000_friendships.sql.

-- 1.
revoke update on table public.friendships from authenticated;
grant update (status, responded_at) on table public.friendships to authenticated;

-- 2.
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
