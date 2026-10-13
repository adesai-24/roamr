-- The v1 challenge catalog.

insert into public.challenges as c (
  slug, title, subtitle, description, category, cover_path, sort_order
)
select
  v.slug, v.title, v.subtitle, v.description, v.category, v.cover_path, v.sort_order::int
from (values
  (
    'us-national-parks',
    'US National Parks',
    'All 63 of them',
    'Every national park in the United States, from Acadia to Zion. Check one off when a moment lands inside it.',
    'parks',
    'challenges/us-national-parks.jpg',
    1
  ),
  (
    'us-50-states',
    'All 50 States',
    'One moment in every state',
    'Set foot in all fifty states. A state counts once a moment resolves to a city inside it.',
    'states',
    'challenges/us-50-states.jpg',
    2
  ),
  (
    'us-bucket-list',
    'US Bucket List',
    'Thirty American classics',
    'The stops that end up on almost everyone''s list eventually: canyons, bridges, boardwalks and a few tourist traps worth the queue.',
    'usa',
    'challenges/us-bucket-list.jpg',
    3
  ),
  (
    'new7wonders',
    'New7Wonders of the World',
    'The 2007 seven',
    'Petra, the Colosseum, Machu Picchu and the rest of the list a hundred million people voted on in 2007.',
    'world',
    'challenges/new7wonders.jpg',
    4
  )
) as v (slug, title, subtitle, description, category, cover_path, sort_order)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  description = excluded.description,
  category = excluded.category,
  cover_path = excluded.cover_path,
  sort_order = excluded.sort_order,
  updated_at = now()
where (c.title, c.subtitle, c.description, c.category, c.cover_path, c.sort_order)
  is distinct from
      (excluded.title, excluded.subtitle, excluded.description, excluded.category,
       excluded.cover_path, excluded.sort_order);
