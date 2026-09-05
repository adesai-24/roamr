-- Guard: every table in `public` must have row level security enabled.
--
-- roamr's core promise is that moments are friends-only. A table shipped
-- without RLS is readable by any authenticated user via the anon key, and that
-- failure is silent. This function makes it loud: CI calls it after applying
-- migrations and fails the build on any offender.

create or replace function public.tables_missing_rls()
returns table (table_name text)
language sql
stable
as $$
  select c.relname::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
    -- postgis installs bookkeeping tables into public that we do not own.
    and c.relname not in ('spatial_ref_sys', 'geography_columns', 'geometry_columns')
  order by 1;
$$;

comment on function public.tables_missing_rls() is
  'Returns public tables with RLS disabled. Must return zero rows; enforced in CI.';
