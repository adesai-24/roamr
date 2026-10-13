-- Fix: the moments column-scoped update grant was never preceded by a revoke.
--
-- Same mistake as 20260108000000_friendships_immutable_identity.sql, on a
-- table that predates that fix: Supabase's bootstrap already runs
-- `grant all on all tables in schema public to authenticated`, so the
-- column-scoped grant added in 20260107000000_moments.sql --
--
--   grant update (caption, taken_at, pin_lat, pin_lng, visibility, user_city_id)
--     on table public.moments to authenticated;
--
-- was additive, not restrictive. The update policy on public.moments checks
-- only row ownership, so with the broad bootstrap grant still in place, an
-- owner could rewrite any column on their own row -- including photo_path,
-- width and height, which the original migration's own comment says should
-- never be edited once a moment exists.

revoke update on table public.moments from authenticated;
grant update (caption, taken_at, pin_lat, pin_lng, visibility, user_city_id)
  on table public.moments to authenticated;
