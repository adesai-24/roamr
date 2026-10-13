# Globe view of your places

Status: approved in chat 2026-10-13, awaiting spec review.

## Goal

A personal, interactive globe in the Places tab showing where you have been as
a heatmap weighted by Moment count. It should feel fast and look distinctive,
and it should cut the app's tab count instead of adding to it.

## Decisions

- **Only your own globe.** No friend globes and no combined friends globe in
  this change. Friend globes may come later; a combined one would conflict with
  non-negotiable #6 (no comparable multi-user progress).
- **No new tab.** The app goes to three tabs: Feed, Places, Friends. Places
  absorbs Trips and hosts the globe. Profile moves to an avatar menu in the
  header.
- **Heat = Moment count.** More Moments in a place means a brighter spot.
- **Renderer: MapLibre GL**, already a dependency (`maplibre-gl` ^6.7, used by
  `components/moments/pin-map.tsx`). Globe projection and heatmap layers are
  built in. No new dependency.
- **No basemap tiles.** Country outlines come from one static GeoJSON in
  `web/public/` (Natural Earth 110m, about 100KB), so no third-party tile fetches.

## Delivery

Two branches cut from `main`, in this order.

### PR 1: `feat/merge-places-trips`

- `NAV_ITEMS` in `app/(app)/app-nav.tsx` becomes Feed, Places, Friends.
- Profile moves to an avatar link/menu in the app header, reusing
  `components/ui/avatar.tsx`.
- `/places` gets a Cities | Trips toggle driven by `?view=trips`, reusing the
  existing grids from `places/page.tsx` and `trips/page.tsx` (`listPlaces`,
  `listTrips`). It is a server-rendered `searchParams` switch, so no client
  state is needed.
- `/trips` redirects to `/places?view=trips`. `/trips/[tripId]` and
  `/places/[cityId]` keep their URLs. The active-tab check treats `/trips/*`
  as Places.
- Trip creation (`trip-forms.tsx`) moves to the Trips view of Places.

### PR 2: `feat/globe`

**Data**
- New `listGlobePoints(userId)` in `lib/moments/queries.ts`. It returns one row
  per Moment the user owns: `{ lat, lng, cityId }`, where lat/lng come from
  `pin_lat/pin_lng` when set and fall back to `cities.lat/lng` otherwise.
  It filters on `user_id = userId` explicitly; RLS also restricts it (authz
  twice).
- The Places page fetches it in parallel with `listPlaces` (`Promise.all`) and
  passes the points to the globe as props. No route handler and no extra
  round trip.
- The tap card reuses the `PlaceSummary` already loaded by `listPlaces`
  (cover, count, date span), so tapping needs no fetch. The cover loads
  through `MomentPhoto` and the existing signed URL.
- No migration.

**Component**: `components/globe/globe.tsx` (client), loaded with
`next/dynamic` and `ssr: false`, so the grid renders first and the map JS
streams in.
- Style: an inline MapLibre style object with no tiles. Ocean background, land
  fill and oak outline from the static GeoJSON, colours read from the
  `globals.css` tokens via `getComputedStyle` (no hex in code).
- Zoom below 4: a `heatmap` layer, weight = Moment count, amber ramp.
- Zoom 4 and above: the heatmap fades out and a `circle` layer of per-city
  points (aggregated client-side from the points, radius by count) plus a
  `symbol` label fade in.
- The globe auto-rotates slowly until the first user interaction. It is off
  under `prefers-reduced-motion`, which also replaces `flyTo` with `jumpTo`.
- Tapping a city shows a card with the cover, `formatMomentCount` and
  `formatCollectionSpan` text, and links to `/places/[cityId]`.
- Clicking a city in the grid flies the globe to it. The list and globe share
  the selected `cityId` through a small client wrapper.

**Layout**
- Desktop: the globe fills the top of the page (about 60vh), with the toggle and
  grid below.
- Mobile: the globe goes full-height and the grid sits in a sheet you pull up
  (CSS scroll-snap, no gesture library).

**Empty state**: the globe still renders and spins, with the overlay prompt
"Add your first moment to light it up" linking to `/moments/new`.

**Accessibility**: the grid is the keyboard and screen-reader path, and the
canvas gets `aria-hidden`. Nothing is reachable only through the globe.

**README**: move "Map view of your collection" from out of scope to in scope.

## Performance budget

- Points payload under 10KB for 500 Moments.
- The globe JS (maplibre, about 200KB gzip) never blocks the first paint of
  the grid.
- Images load only for the card the user opens.

## Testing

- Vitest: point-building and per-city aggregation as pure functions (pin
  overrides city centre; counts per city are correct).
- Playwright: Places renders a canvas; the Trips toggle shows trips; `/trips`
  redirects.

## Out of scope

Friend globes, a combined friends globe, trip arcs between cities, time
scrubbing, and recency weighting.
