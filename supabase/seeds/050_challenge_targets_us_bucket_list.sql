-- A US bucket list: thirty iconic places.

insert into public.challenge_targets as t (
  challenge_id, slug, name, subtitle, lat, lng,
  match_mode, match_value, radius_m, admin1, country_code, sort_order
)
select
  c.id, v.slug, v.name, v.subtitle, v.lat::double precision, v.lng::double precision,
  v.match_mode, v.match_value, v.radius_m::int, v.admin1, v.country_code, v.sort_order::int
from public.challenges c
cross join (values
  ('grand-canyon-south-rim', 'Grand Canyon South Rim', 'Arizona', 36.0544, -112.1401, 'radius', null, 25000, 'Arizona', 'US', 1),
  ('golden-gate-bridge', 'Golden Gate Bridge', 'San Francisco, California', 37.8199, -122.4783, 'radius', null, 3000, 'California', 'US', 2),
  ('alcatraz-island', 'Alcatraz Island', 'San Francisco, California', 37.8267, -122.4230, 'radius', null, 1000, 'California', 'US', 3),
  ('santa-monica-pier', 'Santa Monica Pier', 'Santa Monica, California', 34.0089, -118.4973, 'radius', null, 1500, 'California', 'US', 4),
  ('hollywood-sign', 'Hollywood Sign', 'Los Angeles, California', 34.1341, -118.3215, 'radius', null, 3000, 'California', 'US', 5),
  ('big-sur', 'Big Sur and Bixby Creek Bridge', 'California', 36.3714, -121.9016, 'radius', null, 8000, 'California', 'US', 6),
  ('times-square', 'Times Square', 'New York, New York', 40.7580, -73.9855, 'radius', null, 800, 'New York', 'US', 7),
  ('statue-of-liberty', 'Statue of Liberty', 'New York, New York', 40.6892, -74.0445, 'radius', null, 1000, 'New York', 'US', 8),
  ('central-park', 'Central Park', 'New York, New York', 40.7829, -73.9654, 'radius', null, 2500, 'New York', 'US', 9),
  ('brooklyn-bridge', 'Brooklyn Bridge', 'New York, New York', 40.7061, -73.9969, 'radius', null, 1200, 'New York', 'US', 10),
  ('national-mall', 'The National Mall', 'Washington, DC', 38.8895, -77.0353, 'radius', null, 3000, 'District of Columbia', 'US', 11),
  ('freedom-trail', 'The Freedom Trail', 'Boston, Massachusetts', 42.3584, -71.0598, 'radius', null, 3000, 'Massachusetts', 'US', 12),
  ('niagara-falls', 'Niagara Falls', 'Niagara Falls, New York', 43.0828, -79.0742, 'radius', null, 3000, 'New York', 'US', 13),
  ('millennium-park', 'Millennium Park', 'Chicago, Illinois', 41.8826, -87.6226, 'radius', null, 1200, 'Illinois', 'US', 14),
  ('mount-rushmore', 'Mount Rushmore', 'Keystone, South Dakota', 43.8791, -103.4591, 'radius', null, 3000, 'South Dakota', 'US', 15),
  ('las-vegas-strip', 'The Las Vegas Strip', 'Paradise, Nevada', 36.1147, -115.1728, 'radius', null, 4000, 'Nevada', 'US', 16),
  ('hoover-dam', 'Hoover Dam', 'Nevada and Arizona', 36.0161, -114.7377, 'radius', null, 2000, 'Nevada', 'US', 17),
  ('monument-valley', 'Monument Valley', 'Utah and Arizona', 36.9980, -110.0985, 'radius', null, 12000, 'Utah', 'US', 18),
  ('horseshoe-bend', 'Horseshoe Bend', 'Page, Arizona', 36.8791, -111.5104, 'radius', null, 2000, 'Arizona', 'US', 19),
  ('sedona-red-rocks', 'Sedona Red Rocks', 'Sedona, Arizona', 34.8697, -111.7610, 'radius', null, 10000, 'Arizona', 'US', 20),
  ('space-needle', 'Space Needle', 'Seattle, Washington', 47.6205, -122.3493, 'radius', null, 1000, 'Washington', 'US', 21),
  ('pike-place-market', 'Pike Place Market', 'Seattle, Washington', 47.6097, -122.3422, 'radius', null, 800, 'Washington', 'US', 22),
  ('french-quarter', 'The French Quarter', 'New Orleans, Louisiana', 29.9584, -90.0644, 'radius', null, 1500, 'Louisiana', 'US', 23),
  ('the-alamo', 'The Alamo', 'San Antonio, Texas', 29.4260, -98.4861, 'radius', null, 1000, 'Texas', 'US', 24),
  ('broadway-nashville', 'Broadway', 'Nashville, Tennessee', 36.1600, -86.7780, 'radius', null, 1500, 'Tennessee', 'US', 25),
  ('graceland', 'Graceland', 'Memphis, Tennessee', 35.0477, -90.0261, 'radius', null, 1500, 'Tennessee', 'US', 26),
  ('walt-disney-world', 'Walt Disney World', 'Bay Lake, Florida', 28.3852, -81.5639, 'radius', null, 8000, 'Florida', 'US', 27),
  ('kennedy-space-center', 'Kennedy Space Center', 'Merritt Island, Florida', 28.5729, -80.6490, 'radius', null, 5000, 'Florida', 'US', 28),
  ('south-beach', 'South Beach', 'Miami Beach, Florida', 25.7826, -80.1341, 'radius', null, 3000, 'Florida', 'US', 29),
  ('waikiki-beach', 'Waikīkī Beach', 'Honolulu, Hawaii', 21.2767, -157.8271, 'radius', null, 2000, 'Hawaii', 'US', 30)
) as v (slug, name, subtitle, lat, lng, match_mode, match_value, radius_m, admin1, country_code, sort_order)
where c.slug = 'us-bucket-list'
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
  and c.slug = 'us-bucket-list'
  and c.target_count is distinct from counted.n;
