# roamr conventions

`README.md` owns product scope and the data model. This file owns how code gets
written. A change to scope or the data model updates `README.md` in the same PR.

## Layout

```
web/         Next.js App Router (TypeScript, Tailwind v4)
supabase/    migrations/, seeds/, config.toml
.github/     CI
```

`npm install` in both the repo root and `web/`.

## Non-negotiables

Each of these fails silently when broken.

1. Every table gets RLS in the migration that creates it. CI enforces it via
   `public.tables_missing_rls()`.
2. `public.are_friends(a, b)` is the only friendship check. Never re-derive it.
3. Authorize twice: the server action checks, RLS enforces.
4. `SUPABASE_SERVICE_ROLE_KEY` is server-only. Never `NEXT_PUBLIC_`, never a
   Docker build arg, never in a client component.
5. Photos read through a server-minted signed URL after an authz check.
6. No ranking. No follower counts, like counts, leaderboards, or any endpoint
   returning several users' progress in comparable shape.
7. Config enters through `web/src/lib/env.ts`.
8. Tests never hit the network.
9. Narrow a grant with `revoke` first. Supabase already grants all on `public`,
   so a column-scoped grant on its own restricts nothing.

## Style

- Mutations are server actions. Route handlers are for webhooks, probes, OAuth.
- Reuse before adding: `cn()`, `web/src/components/ui/`, `resolveCity()`, the
  signed-URL helper.
- Migrations are append-only.
- snake_case in SQL, camelCase in TypeScript, plural table names.
- Comments explain why, only where the why is not obvious, one line where
  possible. No em dashes.
- Theme is dark green and oak. Use the tokens in `globals.css`, never a hex.

## Commits

Branches `setup/*`, `feat/*`, `fix/*`, one feature each, cut from `main`.
Subjects are imperative and sentence-case, no `feat:` prefix. Bodies say why.

## Commands

```bash
npm run db:start        # root, needs Docker
npm run db:reset
npm run db:types
npx supabase status

cd web
npm run dev
npm test
npm run test:e2e
npm run typecheck && npm run lint && npm run format:check
```

After changing a migration, run `npm run db:reset && npm run db:types` and
commit the regenerated types with it.
