-- All 63 US National Parks.
--
-- match_mode is 'radius' throughout: a park is a point plus a distance. The
-- radius is sized per park, roughly to cover the park's own footprint without
-- swallowing the next town over. Wrangell-St. Elias is 150 km of slack;
-- Gateway Arch, at 91 acres, gets 1.5 km. A single shared constant would be
-- wrong at both ends.
--
-- Longitudes are all negative -- every one of these is in the western
-- hemisphere, including American Samoa at -170. A dropped minus sign puts a
-- park on the wrong side of the planet and silently stops matching, so the
-- vitest suite in web/src/lib/challenges/ asserts the sign on every row.

insert into public.challenge_targets as t (
  challenge_id, slug, name, subtitle, lat, lng,
  match_mode, match_value, radius_m, admin1, country_code, sort_order
)
select
  c.id, v.slug, v.name, v.subtitle, v.lat::double precision, v.lng::double precision,
  v.match_mode, v.match_value, v.radius_m::int, v.admin1, v.country_code, v.sort_order::int
from public.challenges c
cross join (values
  ('acadia', 'Acadia National Park', 'Maine', 44.3386, -68.2733, 'radius', null, 20000, 'Maine', 'US', 1),
  ('american-samoa', 'National Park of American Samoa', 'American Samoa', -14.2583, -170.6830, 'radius', null, 20000, 'American Samoa', 'US', 2),
  ('arches', 'Arches National Park', 'Utah', 38.7331, -109.5925, 'radius', null, 16000, 'Utah', 'US', 3),
  ('badlands', 'Badlands National Park', 'South Dakota', 43.8554, -101.9777, 'radius', null, 35000, 'South Dakota', 'US', 4),
  ('big-bend', 'Big Bend National Park', 'Texas', 29.2498, -103.2502, 'radius', null, 45000, 'Texas', 'US', 5),
  ('biscayne', 'Biscayne National Park', 'Florida', 25.4823, -80.2100, 'radius', null, 25000, 'Florida', 'US', 6),
  ('black-canyon-of-the-gunnison', 'Black Canyon of the Gunnison National Park', 'Colorado', 38.5754, -107.7416, 'radius', null, 15000, 'Colorado', 'US', 7),
  ('bryce-canyon', 'Bryce Canyon National Park', 'Utah', 37.5930, -112.1871, 'radius', null, 16000, 'Utah', 'US', 8),
  ('canyonlands', 'Canyonlands National Park', 'Utah', 38.3269, -109.8783, 'radius', null, 40000, 'Utah', 'US', 9),
  ('capitol-reef', 'Capitol Reef National Park', 'Utah', 38.3670, -111.2615, 'radius', null, 40000, 'Utah', 'US', 10),
  ('carlsbad-caverns', 'Carlsbad Caverns National Park', 'New Mexico', 32.1479, -104.5567, 'radius', null, 12000, 'New Mexico', 'US', 11),
  ('channel-islands', 'Channel Islands National Park', 'California', 34.0069, -119.7785, 'radius', null, 45000, 'California', 'US', 12),
  ('congaree', 'Congaree National Park', 'South Carolina', 33.7948, -80.7821, 'radius', null, 10000, 'South Carolina', 'US', 13),
  ('crater-lake', 'Crater Lake National Park', 'Oregon', 42.9446, -122.1090, 'radius', null, 18000, 'Oregon', 'US', 14),
  ('cuyahoga-valley', 'Cuyahoga Valley National Park', 'Ohio', 41.2808, -81.5678, 'radius', null, 18000, 'Ohio', 'US', 15),
  ('death-valley', 'Death Valley National Park', 'California and Nevada', 36.5323, -116.9325, 'radius', null, 90000, 'California', 'US', 16),
  ('denali', 'Denali National Park and Preserve', 'Alaska', 63.1148, -151.1926, 'radius', null, 90000, 'Alaska', 'US', 17),
  ('dry-tortugas', 'Dry Tortugas National Park', 'Florida', 24.6285, -82.8732, 'radius', null, 15000, 'Florida', 'US', 18),
  ('everglades', 'Everglades National Park', 'Florida', 25.2866, -80.8987, 'radius', null, 60000, 'Florida', 'US', 19),
  ('gates-of-the-arctic', 'Gates of the Arctic National Park and Preserve', 'Alaska', 67.7805, -153.2870, 'radius', null, 120000, 'Alaska', 'US', 20),
  ('gateway-arch', 'Gateway Arch National Park', 'Missouri', 38.6247, -90.1848, 'radius', null, 1500, 'Missouri', 'US', 21),
  ('glacier', 'Glacier National Park', 'Montana', 48.7596, -113.7870, 'radius', null, 50000, 'Montana', 'US', 22),
  ('glacier-bay', 'Glacier Bay National Park and Preserve', 'Alaska', 58.6658, -136.9002, 'radius', null, 80000, 'Alaska', 'US', 23),
  ('grand-canyon', 'Grand Canyon National Park', 'Arizona', 36.0544, -112.1401, 'radius', null, 70000, 'Arizona', 'US', 24),
  ('grand-teton', 'Grand Teton National Park', 'Wyoming', 43.7904, -110.6818, 'radius', null, 40000, 'Wyoming', 'US', 25),
  ('great-basin', 'Great Basin National Park', 'Nevada', 38.9833, -114.3000, 'radius', null, 20000, 'Nevada', 'US', 26),
  ('great-sand-dunes', 'Great Sand Dunes National Park and Preserve', 'Colorado', 37.7916, -105.5943, 'radius', null, 20000, 'Colorado', 'US', 27),
  ('great-smoky-mountains', 'Great Smoky Mountains National Park', 'Tennessee and North Carolina', 35.6118, -83.4895, 'radius', null, 40000, 'Tennessee', 'US', 28),
  ('guadalupe-mountains', 'Guadalupe Mountains National Park', 'Texas', 31.9231, -104.8694, 'radius', null, 20000, 'Texas', 'US', 29),
  ('haleakala', 'Haleakalā National Park', 'Hawaii', 20.7204, -156.1552, 'radius', null, 20000, 'Hawaii', 'US', 30),
  ('hawaii-volcanoes', 'Hawaiʻi Volcanoes National Park', 'Hawaii', 19.4194, -155.2885, 'radius', null, 35000, 'Hawaii', 'US', 31),
  ('hot-springs', 'Hot Springs National Park', 'Arkansas', 34.5217, -93.0424, 'radius', null, 5000, 'Arkansas', 'US', 32),
  ('indiana-dunes', 'Indiana Dunes National Park', 'Indiana', 41.6533, -87.0524, 'radius', null, 15000, 'Indiana', 'US', 33),
  ('isle-royale', 'Isle Royale National Park', 'Michigan', 48.0999, -88.5500, 'radius', null, 40000, 'Michigan', 'US', 34),
  ('joshua-tree', 'Joshua Tree National Park', 'California', 33.8734, -115.9010, 'radius', null, 45000, 'California', 'US', 35),
  ('katmai', 'Katmai National Park and Preserve', 'Alaska', 58.5970, -155.0063, 'radius', null, 90000, 'Alaska', 'US', 36),
  ('kenai-fjords', 'Kenai Fjords National Park', 'Alaska', 59.9226, -149.6503, 'radius', null, 50000, 'Alaska', 'US', 37),
  ('kings-canyon', 'Kings Canyon National Park', 'California', 36.8879, -118.5551, 'radius', null, 35000, 'California', 'US', 38),
  ('kobuk-valley', 'Kobuk Valley National Park', 'Alaska', 67.3556, -159.2836, 'radius', null, 60000, 'Alaska', 'US', 39),
  ('lake-clark', 'Lake Clark National Park and Preserve', 'Alaska', 60.9672, -153.4179, 'radius', null, 80000, 'Alaska', 'US', 40),
  ('lassen-volcanic', 'Lassen Volcanic National Park', 'California', 40.4977, -121.4207, 'radius', null, 25000, 'California', 'US', 41),
  ('mammoth-cave', 'Mammoth Cave National Park', 'Kentucky', 37.1862, -86.1000, 'radius', null, 15000, 'Kentucky', 'US', 42),
  ('mesa-verde', 'Mesa Verde National Park', 'Colorado', 37.2309, -108.4618, 'radius', null, 20000, 'Colorado', 'US', 43),
  ('mount-rainier', 'Mount Rainier National Park', 'Washington', 46.8800, -121.7269, 'radius', null, 25000, 'Washington', 'US', 44),
  ('new-river-gorge', 'New River Gorge National Park and Preserve', 'West Virginia', 37.9393, -81.0687, 'radius', null, 30000, 'West Virginia', 'US', 45),
  ('north-cascades', 'North Cascades National Park', 'Washington', 48.7718, -121.2985, 'radius', null, 45000, 'Washington', 'US', 46),
  ('olympic', 'Olympic National Park', 'Washington', 47.8021, -123.6044, 'radius', null, 55000, 'Washington', 'US', 47),
  ('petrified-forest', 'Petrified Forest National Park', 'Arizona', 34.9100, -109.8068, 'radius', null, 25000, 'Arizona', 'US', 48),
  ('pinnacles', 'Pinnacles National Park', 'California', 36.4906, -121.1825, 'radius', null, 12000, 'California', 'US', 49),
  ('redwood', 'Redwood National and State Parks', 'California', 41.2132, -124.0046, 'radius', null, 35000, 'California', 'US', 50),
  ('rocky-mountain', 'Rocky Mountain National Park', 'Colorado', 40.3428, -105.6836, 'radius', null, 30000, 'Colorado', 'US', 51),
  ('saguaro', 'Saguaro National Park', 'Arizona', 32.2400, -110.8400, 'radius', null, 40000, 'Arizona', 'US', 52),
  ('sequoia', 'Sequoia National Park', 'California', 36.4864, -118.5658, 'radius', null, 35000, 'California', 'US', 53),
  ('shenandoah', 'Shenandoah National Park', 'Virginia', 38.4755, -78.4535, 'radius', null, 60000, 'Virginia', 'US', 54),
  ('theodore-roosevelt', 'Theodore Roosevelt National Park', 'North Dakota', 46.9790, -103.5387, 'radius', null, 40000, 'North Dakota', 'US', 55),
  ('virgin-islands', 'Virgin Islands National Park', 'US Virgin Islands', 18.3428, -64.7486, 'radius', null, 10000, 'United States Virgin Islands', 'US', 56),
  ('voyageurs', 'Voyageurs National Park', 'Minnesota', 48.4839, -92.8386, 'radius', null, 35000, 'Minnesota', 'US', 57),
  ('white-sands', 'White Sands National Park', 'New Mexico', 32.7797, -106.1717, 'radius', null, 25000, 'New Mexico', 'US', 58),
  ('wind-cave', 'Wind Cave National Park', 'South Dakota', 43.5724, -103.4780, 'radius', null, 12000, 'South Dakota', 'US', 59),
  ('wrangell-st-elias', 'Wrangell-St. Elias National Park and Preserve', 'Alaska', 61.7104, -142.9857, 'radius', null, 150000, 'Alaska', 'US', 60),
  ('yellowstone', 'Yellowstone National Park', 'Wyoming, Montana and Idaho', 44.5979, -110.5471, 'radius', null, 70000, 'Wyoming', 'US', 61),
  ('yosemite', 'Yosemite National Park', 'California', 37.8651, -119.5383, 'radius', null, 40000, 'California', 'US', 62),
  ('zion', 'Zion National Park', 'Utah', 37.2982, -113.0263, 'radius', null, 25000, 'Utah', 'US', 63)
) as v (slug, name, subtitle, lat, lng, match_mode, match_value, radius_m, admin1, country_code, sort_order)
where c.slug = 'us-national-parks'
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

-- Derive target_count instead of hard-coding 63, so adding or removing a park
-- above is the only edit needed.
update public.challenges c
set target_count = counted.n, updated_at = now()
from (
  select challenge_id, count(*)::int as n
  from public.challenge_targets
  group by challenge_id
) counted
where counted.challenge_id = c.id
  and c.slug = 'us-national-parks'
  and c.target_count is distinct from counted.n;
