# roamr — working conventions

`README.md` is the source of truth for product scope and the data model. This
file is the source of truth for *how* code gets written here. If a change
affects scope or the data model, update `README.md` in the same PR.

## Layout

```
web/         Next.js App Router app (TypeScript, Tailwind v4)
supabase/    The database contract: migrations/, seeds/, config.toml
infra/       Helm chart, k8s manifests, Terraform (validated in CI, not yet applied)
.github/     CI
```

Run `npm install` in both the repo root (Supabase CLI + db scripts) and `web/`.

## Non-negotiables

These exist because the product's core promise is that moments are visible only
to friends, and because a mistake in any of them fails silently.

1. **Every table gets RLS in the same migration that creates it.** CI fails on
   any `public` table with RLS disabled (`public.tables_missing_rls()`).
2. **`public.are_friends(a, b)` is the only friendship check.** Never re-derive
   "are these two people friends" in TypeScript or in a new SQL policy.
3. **Authorize twice.** Server actions check permission *and* RLS enforces it.
   A missed check in one layer must not be sufficient to leak data.
4. **`SUPABASE_SERVICE_ROLE_KEY` is server-only.** Never `NEXT_PUBLIC_`, never a
   Docker build arg, never imported into a client component.
5. **Photos are private.** Reads go through a server-minted short-TTL signed URL
   after an authz check — never a public bucket URL.
6. **No ranking, ever.** No follower counts, no like counts, no leaderboards, no
   endpoint returning multiple users' progress in a comparable shape. The feed
   is `order by created_at desc` and nothing else.
7. **Config enters through `web/src/lib/env.ts`.** No bare `process.env` reads
   elsewhere.
8. **Tests never hit the network.** Mapbox goes through the fixture-backed fake.

## Conventions

- **Mutations are server actions**, not route handlers. Route handlers are for
  webhooks, health probes, and OAuth callbacks.
- **Reuse before adding**: `cn()` (`web/src/lib/utils.ts`), the UI primitives in
  `web/src/components/ui/`, `resolveCity()` for any city write, the signed-URL
  helper for any photo read.
- **Migrations are append-only.** Never edit an applied migration; add a new one.
- **Naming**: snake_case in SQL, camelCase in TypeScript. Tables are plural.
- **Comments explain why, not what.** Skip the ones that restate the code.

## Commits and branches

- Branches: `setup/*` for infrastructure, `feat/*` for features. One feature per
  branch, cut fresh from `main`.
- Commit subjects are imperative and sentence-case with **no** `feat:` prefix
  (matching existing history): *"Add friend request and accept flow"*. The body
  explains why the change was made, not what the diff shows.

## Commands

```bash
npm run db:start        # repo root — start local Supabase (needs Docker)
npm run db:reset        # reapply all migrations + seeds from scratch
npm run db:types        # regenerate web/src/lib/supabase/database.types.ts
npx supabase status     # local URLs and keys for web/.env.local

cd web
npm run dev             # http://localhost:3000
npm test                # vitest
npm run test:e2e        # playwright (starts its own dev server)
npm run typecheck && npm run lint && npm run format:check
npm run docker:build    # production image, as CI and the cluster build it
```

After changing any migration, run `npm run db:reset && npm run db:types` from the
root and commit the regenerated types with the migration.
