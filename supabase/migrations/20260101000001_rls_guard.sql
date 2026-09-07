-- Guard: every table in `public` must have row level security enabled.

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

-- Guard: re-running seeds must not change a single row.

create or replace function public.public_tables_row_hash()
returns text
language plpgsql
stable
as $$
declare
  tbl record;
  tbl_hash text;
  combined text := '';
begin
  for tbl in
    select c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in ('spatial_ref_sys', 'geography_columns', 'geometry_columns')
    order by 1
  loop
    execute format(
      'select coalesce(md5(string_agg(t::text, %L order by t::text)), %L) from public.%I t',
      '|', '', tbl.table_name
    ) into tbl_hash;
    combined := combined || tbl.table_name || ':' || tbl_hash || '|';
  end loop;
  return md5(combined);
end;
$$;

comment on function public.public_tables_row_hash() is
  'Content-based checksum of every row in every public table. Used by CI to verify seeds are idempotent -- row counts alone would miss a delete+reinsert of different data with the same count.';
