-- Baseline extensions for roamr.
--
-- postgis lands here rather than alongside the first feature that needs it
-- (challenge proximity matching) because enabling it later would mean
-- backfilling generated geography columns on tables that already hold rows.
-- citext backs case-insensitive usernames.

create extension if not exists postgis with schema extensions;
create extension if not exists citext with schema extensions;
