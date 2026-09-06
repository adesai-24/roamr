# roamr

brag about touching grass to only your friends

## Vision

A lowkey, friends-first social app for collecting the cities/towns you've
visited and sharing aesthetic photo moments from them. Not a follower-count
game, not restaurant ratings (that's Beli), not route/activity tracking
(that's Strava).

The point isn't reach — it's the enjoyment of sharing real experiences with
your closest friends. That could grow into something bigger later
(public/creator profiles), but v1 is intentionally small and personal.

## Platform

**Web first, not a native app.** The plan had been leaning toward a
phone-only native app, but the priority right now is getting this in front
of friends with as little friction as possible — a link they open in a
browser beats an app they have to install. A web app also makes testing
trivial: push a change, share the URL, done, no TestFlight/Play Store
review cycle in the loop.

A native app (React Native/Expo, distributed via TestFlight and Play
Internal Testing for low-friction beta installs) stays on the table as a
later step once the product itself is proven out — mainly because that's
what unlocks deeper native features like Apple Photos library integration
(see the photo library note below). Not a v1 concern.

## Core loop

1. Add a photo **Moment** (with an optional caption and optional pin).
2. It lands in your running collection for that **City**.
3. Optionally group it into a **Trip** alongside other Moments.
4. Friends see it in their feed.

## Data model

- **User** — an account.
- **Friendship** — mutual, request/accept between two Users. Binary for now
  (friend or not); a "close friends" tier is a possible future addition, not
  v1.
- **City** — a canonical place (e.g. "Chicago, IL"), resolved via geocoding
  so everyone's "Chicago" is the same entity instead of duplicates.
- **UserCity** — a User's running collection for a City. It just grows over
  time as Moments get added — there's no discrete "visit" boundary or trip
  requirement at this level.
- **Moment** — a photo with a timestamp, optional caption/vibe, and an
  optional pin (lat/long within the city, for people who want to mark
  exactly where a photo was taken). Belongs to exactly one UserCity. Can be
  co-tagged with friends who were there too, so it becomes a shared memory
  rather than a solo broadcast. Optionally also linked to a Trip.
- **Trip** — an optional, user-named grouping (e.g. "July 4th trip",
  "Pinnacles trip"). Just a free-text label, not tied to a canonical
  place — a Trip can span Moments across multiple Cities. Optionally has a
  date range and a list of participants.
- **Feed** — reverse-chronological activity from your friends. No ranking
  algorithm.
- **Challenge** — a curated checklist of places worth going: all 63 US
  National Parks, the New7Wonders, all 50 states, a US bucket list. Public
  reference data, identical for everyone and seeded rather than user-created.
  A User joins a Challenge, and joining is what puts it on their profile.
- **ChallengeTarget** — one place inside a Challenge. How a visit gets
  recognised differs by target, so each carries a match mode: a *radius* (a
  point plus a per-target distance — Yellowstone needs a much wider circle
  than Gateway Arch), an *admin1* name (the state or region a City resolved
  to, for "all 50 states", which no circle can express), or an exact *city*.
- **ChallengeCompletion** — a User ticking one ChallengeTarget off, either
  by hand or by accepting a suggestion matched from a Moment's location. A
  declined suggestion is remembered too, so the same photo is never offered
  twice.

Two ways to browse your own history fall out of this for free: by **city**
("everywhere I've been to Chicago") or by **trip** ("everything from that
one weekend"), without either view canceling out the other.

## Design principles

These are meant to be enforced by the mechanics, not just stated:

- No public follower/following counts.
- Pure chronological feed — nothing to optimize for.
- No public like-count vanity metric.
- No bulk friend-import or "people you may know" push — the friend graph
  grows slowly and intentionally.
- Co-tagging a Moment makes it a shared experience between people, not
  content one person broadcasts to an audience.
- **Challenges are personal checklists, never an ordering of people.** No
  leaderboard, no ranking, and no global "N people have completed this"
  counter. This is a rule rather than a gap in the feature set: no table,
  query or endpoint may return several users' challenge progress in a
  comparable, orderable shape. Progress does become visible to your friends,
  because that's the fun part — it is never ranked against them, and any
  future change here has to hold that line.

## Scope

### In scope (v1)

- Accounts + auth
- Friend graph (mutual request/accept)
- Cities (canonical, deduped via geocoding)
- Running per-user, per-city photo collections (UserCity + Moment)
- Optional pins on Moments
- Optional free-text Trip grouping across cities
- Co-tagging friends on a Moment
- Friends-only reverse-chronological feed
- Challenges: curated place checklists (national parks, all 50 states, a
  bucket list) with per-user, unranked progress
- Basic privacy: friends-only by default, opt-in public per Moment/account

### Explicitly out of scope (v1) — deferred, not rejected

- Ratings/rankings/leaderboards
- Routes, GPS tracking, workout data
- Public discovery/explore feed beyond your friends
- Comment threads / public like counts
- Want-to-go / saved-places lists
- Push notifications
- Map view of your collection
- Recommendations
- Canonical (looked-up) Trip destinations — Trips stay free-text for now
- "Close friends" tier within Friendship
- Automatic photo-library import/suggestions (see note below)

### Note on photo library integration

- **Apple Photos**: feasible via PhotoKit, but only from a **native iOS
  app** — it can query the library by date/location for smart suggestions.
  Not available to a web app.
- **Google Photos**: Google locked down library-wide read access in 2025;
  integration is now Picker-only (user manually selects photos each time,
  no server-side filtering by location). Effectively equivalent to a plain
  upload button.
- Plain manual upload (device camera roll, via the browser's file picker)
  covers all platforms today and is the v1 approach. Smart suggestions from
  an existing library would require a native iOS app, which is a possible
  future step, not a current one (see Platform above).

## Getting started on your own laptop

**You'll need:** [Node.js](https://nodejs.org) 22+, [Docker Desktop](https://www.docker.com/products/docker-desktop/) (the local database runs in it), and Git.

```bash
git clone https://github.com/adesai-24/roamr.git
cd roamr

npm install              # repo root — Supabase CLI + db scripts
cd web && npm install    # the app itself
cd ..

npm run db:start         # starts a local database (needs Docker running)
npx supabase status      # prints the local URLs/keys you need next

# copy the repo-root .env.example to web/.env.local and fill it in
# with the values npx supabase status just printed

npm run db:reset         # loads the database schema

cd web
npm run dev              # http://localhost:3000
```

See `CLAUDE.md`'s Commands section for tests, linting, and everything else.

### Using Claude Code on this project

This repo carries a `CLAUDE.md` file with its working conventions — security
rules, coding style, commands, branch naming. Open this folder with
[Claude Code](https://claude.com/claude-code) (run `claude` from inside the
`roamr` directory) and it reads that file automatically, so it already knows
the project's rules before you ask it to change anything.

## Contributing

This doc is the source of truth for what v1 is and isn't. If a change
affects the scope or data model above, update this README as part of that
change so everyone stays on the same page.
