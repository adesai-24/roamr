-- Two fixes that need the database.

-- 1. profiles: same mistake the moments and friendships migrations already corrected.
--
-- Supabase's bootstrap grants all on public tables to authenticated, so the table-wide update
-- grant in 20260102000000_profiles.sql was never narrowed. The update policy only checks row
-- ownership, which let a person rewrite id-adjacent bookkeeping such as created_at on their own
-- row. Revoke first, then grant the columns the app actually writes (updated_at is set by trigger).
revoke update on table public.profiles from authenticated;
grant update (username, display_name, avatar_path, is_public)
  on table public.profiles to authenticated;

-- 2. The feed orders every readable moment by (created_at, id) descending, and only
-- (user_id, created_at) was indexed. Without this the planner sorts the whole readable set,
-- which grows with every friend's every photo, to return twenty rows.
create index moments_feed_idx on public.moments (created_at desc, id desc);
