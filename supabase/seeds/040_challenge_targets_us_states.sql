-- All 50 US states.
--
-- This is the challenge that forced match_mode to exist. A state is a polygon,
-- not a circle: a radius large enough to cover Texas also covers most of
-- Oklahoma, and one small enough to exclude Oklahoma misses El Paso. So these
-- match by name instead -- match_value is compared against the first-level
-- administrative area the geocoder returns for a moment's city, which is why it
-- is the full state name ('Illinois') and not the postal code ('IL').
--
-- lat/lng are still seeded: they are the state's approximate geographic centre,
-- used for map pins and list thumbnails. They are display data, never the match
-- key for these rows.

insert into public.challenge_targets as t (
  challenge_id, slug, name, subtitle, lat, lng,
  match_mode, match_value, radius_m, admin1, country_code, sort_order
)
select
  c.id, v.slug, v.name, v.subtitle, v.lat::double precision, v.lng::double precision,
  v.match_mode, v.match_value, v.radius_m::int, v.admin1, v.country_code, v.sort_order::int
from public.challenges c
cross join (values
  ('alabama', 'Alabama', 'AL', 32.7794, -86.8287, 'admin1', 'Alabama', null, 'Alabama', 'US', 1),
  ('alaska', 'Alaska', 'AK', 64.0685, -152.2782, 'admin1', 'Alaska', null, 'Alaska', 'US', 2),
  ('arizona', 'Arizona', 'AZ', 34.2744, -111.6602, 'admin1', 'Arizona', null, 'Arizona', 'US', 3),
  ('arkansas', 'Arkansas', 'AR', 34.8938, -92.4426, 'admin1', 'Arkansas', null, 'Arkansas', 'US', 4),
  ('california', 'California', 'CA', 37.1841, -119.4696, 'admin1', 'California', null, 'California', 'US', 5),
  ('colorado', 'Colorado', 'CO', 38.9972, -105.5478, 'admin1', 'Colorado', null, 'Colorado', 'US', 6),
  ('connecticut', 'Connecticut', 'CT', 41.6219, -72.7273, 'admin1', 'Connecticut', null, 'Connecticut', 'US', 7),
  ('delaware', 'Delaware', 'DE', 38.9896, -75.5050, 'admin1', 'Delaware', null, 'Delaware', 'US', 8),
  ('florida', 'Florida', 'FL', 28.6305, -82.4497, 'admin1', 'Florida', null, 'Florida', 'US', 9),
  ('georgia', 'Georgia', 'GA', 32.6415, -83.4426, 'admin1', 'Georgia', null, 'Georgia', 'US', 10),
  ('hawaii', 'Hawaii', 'HI', 20.2927, -156.3737, 'admin1', 'Hawaii', null, 'Hawaii', 'US', 11),
  ('idaho', 'Idaho', 'ID', 44.3509, -114.6130, 'admin1', 'Idaho', null, 'Idaho', 'US', 12),
  ('illinois', 'Illinois', 'IL', 40.0417, -89.1965, 'admin1', 'Illinois', null, 'Illinois', 'US', 13),
  ('indiana', 'Indiana', 'IN', 39.8942, -86.2816, 'admin1', 'Indiana', null, 'Indiana', 'US', 14),
  ('iowa', 'Iowa', 'IA', 42.0751, -93.4960, 'admin1', 'Iowa', null, 'Iowa', 'US', 15),
  ('kansas', 'Kansas', 'KS', 38.4937, -98.3804, 'admin1', 'Kansas', null, 'Kansas', 'US', 16),
  ('kentucky', 'Kentucky', 'KY', 37.5347, -85.3021, 'admin1', 'Kentucky', null, 'Kentucky', 'US', 17),
  ('louisiana', 'Louisiana', 'LA', 31.0689, -91.9968, 'admin1', 'Louisiana', null, 'Louisiana', 'US', 18),
  ('maine', 'Maine', 'ME', 45.3695, -69.2428, 'admin1', 'Maine', null, 'Maine', 'US', 19),
  ('maryland', 'Maryland', 'MD', 39.0550, -76.7909, 'admin1', 'Maryland', null, 'Maryland', 'US', 20),
  ('massachusetts', 'Massachusetts', 'MA', 42.2596, -71.8083, 'admin1', 'Massachusetts', null, 'Massachusetts', 'US', 21),
  ('michigan', 'Michigan', 'MI', 44.3467, -85.4102, 'admin1', 'Michigan', null, 'Michigan', 'US', 22),
  ('minnesota', 'Minnesota', 'MN', 46.2807, -94.3053, 'admin1', 'Minnesota', null, 'Minnesota', 'US', 23),
  ('mississippi', 'Mississippi', 'MS', 32.7364, -89.6678, 'admin1', 'Mississippi', null, 'Mississippi', 'US', 24),
  ('missouri', 'Missouri', 'MO', 38.3566, -92.4580, 'admin1', 'Missouri', null, 'Missouri', 'US', 25),
  ('montana', 'Montana', 'MT', 47.0527, -109.6333, 'admin1', 'Montana', null, 'Montana', 'US', 26),
  ('nebraska', 'Nebraska', 'NE', 41.5378, -99.7951, 'admin1', 'Nebraska', null, 'Nebraska', 'US', 27),
  ('nevada', 'Nevada', 'NV', 39.3289, -116.6312, 'admin1', 'Nevada', null, 'Nevada', 'US', 28),
  ('new-hampshire', 'New Hampshire', 'NH', 43.6805, -71.5811, 'admin1', 'New Hampshire', null, 'New Hampshire', 'US', 29),
  ('new-jersey', 'New Jersey', 'NJ', 40.1907, -74.6728, 'admin1', 'New Jersey', null, 'New Jersey', 'US', 30),
  ('new-mexico', 'New Mexico', 'NM', 34.4071, -106.1126, 'admin1', 'New Mexico', null, 'New Mexico', 'US', 31),
  ('new-york', 'New York', 'NY', 42.9538, -75.5268, 'admin1', 'New York', null, 'New York', 'US', 32),
  ('north-carolina', 'North Carolina', 'NC', 35.5557, -79.3877, 'admin1', 'North Carolina', null, 'North Carolina', 'US', 33),
  ('north-dakota', 'North Dakota', 'ND', 47.4501, -100.4659, 'admin1', 'North Dakota', null, 'North Dakota', 'US', 34),
  ('ohio', 'Ohio', 'OH', 40.2862, -82.7937, 'admin1', 'Ohio', null, 'Ohio', 'US', 35),
  ('oklahoma', 'Oklahoma', 'OK', 35.5889, -97.4943, 'admin1', 'Oklahoma', null, 'Oklahoma', 'US', 36),
  ('oregon', 'Oregon', 'OR', 43.9336, -120.5583, 'admin1', 'Oregon', null, 'Oregon', 'US', 37),
  ('pennsylvania', 'Pennsylvania', 'PA', 40.8781, -77.7996, 'admin1', 'Pennsylvania', null, 'Pennsylvania', 'US', 38),
  ('rhode-island', 'Rhode Island', 'RI', 41.6762, -71.5562, 'admin1', 'Rhode Island', null, 'Rhode Island', 'US', 39),
  ('south-carolina', 'South Carolina', 'SC', 33.9169, -80.8964, 'admin1', 'South Carolina', null, 'South Carolina', 'US', 40),
  ('south-dakota', 'South Dakota', 'SD', 44.4443, -100.2263, 'admin1', 'South Dakota', null, 'South Dakota', 'US', 41),
  ('tennessee', 'Tennessee', 'TN', 35.8580, -86.3505, 'admin1', 'Tennessee', null, 'Tennessee', 'US', 42),
  ('texas', 'Texas', 'TX', 31.4757, -99.3312, 'admin1', 'Texas', null, 'Texas', 'US', 43),
  ('utah', 'Utah', 'UT', 39.3055, -111.6703, 'admin1', 'Utah', null, 'Utah', 'US', 44),
  ('vermont', 'Vermont', 'VT', 44.0687, -72.6658, 'admin1', 'Vermont', null, 'Vermont', 'US', 45),
  ('virginia', 'Virginia', 'VA', 37.5215, -78.8537, 'admin1', 'Virginia', null, 'Virginia', 'US', 46),
  ('washington', 'Washington', 'WA', 47.3826, -120.4472, 'admin1', 'Washington', null, 'Washington', 'US', 47),
  ('west-virginia', 'West Virginia', 'WV', 38.6409, -80.6227, 'admin1', 'West Virginia', null, 'West Virginia', 'US', 48),
  ('wisconsin', 'Wisconsin', 'WI', 44.6243, -89.9941, 'admin1', 'Wisconsin', null, 'Wisconsin', 'US', 49),
  ('wyoming', 'Wyoming', 'WY', 42.9957, -107.5512, 'admin1', 'Wyoming', null, 'Wyoming', 'US', 50)
) as v (slug, name, subtitle, lat, lng, match_mode, match_value, radius_m, admin1, country_code, sort_order)
where c.slug = 'us-50-states'
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
  and c.slug = 'us-50-states'
  and c.target_count is distinct from counted.n;
