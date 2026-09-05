-- The New7Wonders of the World, as voted in 2007.
--
-- The only non-US challenge in the v1 catalog, so it is also the one that
-- proves the schema is not quietly US-shaped: country_code varies, three of the
-- seven sit at positive longitudes, and two are south of the equator.
--
-- The Great Wall is the awkward one -- it runs for thousands of kilometres, so
-- no single point plus radius describes it. The seeded point is Badaling with a
-- radius wide enough to cover the restored sections most visitors reach from
-- Beijing (Badaling, Juyongguan, Mutianyu). Walking a remote section in Gansu
-- will not auto-match; ticking it off by hand still works.

insert into public.challenge_targets as t (
  challenge_id, slug, name, subtitle, lat, lng,
  match_mode, match_value, radius_m, admin1, country_code, sort_order
)
select
  c.id, v.slug, v.name, v.subtitle, v.lat::double precision, v.lng::double precision,
  v.match_mode, v.match_value, v.radius_m::int, v.admin1, v.country_code, v.sort_order::int
from public.challenges c
cross join (values
  ('great-wall-of-china', 'Great Wall of China', 'Badaling, China', 40.3597, 116.0169, 'radius', null, 60000, 'Beijing', 'CN', 1),
  ('petra', 'Petra', 'Ma''an Governorate, Jordan', 30.3285, 35.4444, 'radius', null, 5000, 'Ma''an', 'JO', 2),
  ('christ-the-redeemer', 'Christ the Redeemer', 'Rio de Janeiro, Brazil', -22.9519, -43.2105, 'radius', null, 3000, 'Rio de Janeiro', 'BR', 3),
  ('machu-picchu', 'Machu Picchu', 'Cusco Region, Peru', -13.1631, -72.5450, 'radius', null, 5000, 'Cusco', 'PE', 4),
  ('chichen-itza', 'Chichén Itzá', 'Yucatán, Mexico', 20.6843, -88.5678, 'radius', null, 5000, 'Yucatán', 'MX', 5),
  ('colosseum', 'Colosseum', 'Rome, Italy', 41.8902, 12.4922, 'radius', null, 2000, 'Lazio', 'IT', 6),
  ('taj-mahal', 'Taj Mahal', 'Agra, India', 27.1751, 78.0421, 'radius', null, 3000, 'Uttar Pradesh', 'IN', 7)
) as v (slug, name, subtitle, lat, lng, match_mode, match_value, radius_m, admin1, country_code, sort_order)
where c.slug = 'new7wonders'
on conflict (challenge_id, slug) do update set
  name = excluded.name,
  subtitle = excluded.subtitle,
  lat = excluded.lat,
  lng = excluded.lng,
  match_mode = excluded.match_mode,
  match_value = excluded.match_value,
  radius_m = excluded.radius_m,
  admin1 = excluded.admin1,
  country_code = excluded.country_code,
  sort_order = excluded.sort_order
where (t.name, t.subtitle, t.lat, t.lng, t.match_mode, t.match_value,
       t.radius_m, t.admin1, t.country_code, t.sort_order)
  is distinct from
      (excluded.name, excluded.subtitle, excluded.lat, excluded.lng, excluded.match_mode,
       excluded.match_value, excluded.radius_m, excluded.admin1, excluded.country_code,
       excluded.sort_order);

update public.challenges c
set target_count = counted.n, updated_at = now()
from (
  select challenge_id, count(*)::int as n
  from public.challenge_targets
  group by challenge_id
) counted
where counted.challenge_id = c.id
  and c.slug = 'new7wonders'
  and c.target_count is distinct from counted.n;
