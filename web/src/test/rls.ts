import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

/**
 * Harness for row level security tests.
 *
 * Friends-only visibility is the entire promise of this product, and it is
 * enforced in exactly one place that a passing unit test can never reach: the
 * policies on the tables. A mocked Supabase client proves that the application
 * asked the right question; only a real database proves that the answer is no.
 *
 * So these tests do the one thing the rest of the suite is forbidden from
 * doing -- talk to a live Postgres -- with several real users holding several
 * real sessions, and assert that the ones who should not see a row do not see
 * it. Later tables (moments, trips, challenge progress) need the same two-user
 * shape, so the fixture below is deliberately table-agnostic: it creates people
 * and hands back their clients, and each test file brings its own assertions.
 *
 * Nothing here runs without a database. `rlsEnabled` is false on a developer's
 * machine with no local stack, and the test files skip themselves; CI starts
 * the stack and sets the variables, which is where these actually run.
 */

export interface RlsEnvironment {
  url: string;
  /** Public key. The per-user clients hold this, so RLS applies to them. */
  anonKey: string;
  /** Bypasses RLS. Used only to set the scene and to check it independently. */
  serviceRoleKey: string;
}

/**
 * Test-harness configuration, read straight from the environment rather than
 * through `lib/env.ts`, for two reasons that both matter:
 *
 * 1. `serverEnv()` throws when config is missing. Missing config here is the
 *    normal case -- it is how the tests know to skip.
 * 2. The names are deliberately not the app's. CI sets placeholder values for
 *    `NEXT_PUBLIC_SUPABASE_URL` and friends so that `next build` can inline
 *    them, and a harness keyed on those names would think a database was
 *    present in every job and fail against nothing.
 */
export function rlsEnvironment(): RlsEnvironment | null {
  const url = process.env.SUPABASE_TEST_URL;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

export const RLS_ENV = rlsEnvironment();

/** Whether a database is reachable. Test files gate themselves on this. */
export const rlsEnabled = RLS_ENV !== null;

export const RLS_SKIP_REASON =
  "needs a database: set SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_ROLE_KEY";

export interface TestUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  /**
   * A client holding this person's session and the anon key, so every statement
   * it makes is subject to policies. One client per person, never shared: a
   * single client that switches sessions cannot prove that two people are being
   * kept apart.
   */
  db: SupabaseClient;
}

export interface RlsFixture {
  /**
   * Service-role client. Bypasses RLS entirely, so it is only ever used to
   * arrange a scenario or to verify what actually landed in the table -- never
   * as the subject of an assertion about access.
   */
  admin: SupabaseClient;
  users: TestUser[];
  /** Deletes the accounts, which cascades to everything keyed on them. */
  cleanup: () => Promise<void>;
}

/** Password auth is the cheapest way to get a real session; length matches config.toml. */
const TEST_PASSWORD = "roamr-rls-test-password";

function requireEnv(): RlsEnvironment {
  if (!RLS_ENV) throw new Error(`Cannot build an RLS fixture: ${RLS_SKIP_REASON}`);
  return RLS_ENV;
}

function uniqueSuffix(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 10);
}

/**
 * Create `count` signed-in people, each with their own client.
 *
 * Users are made once per test file and reused, with the rows under test
 * cleared between cases: `signInWithPassword` counts against the local stack's
 * sign-in rate limit, and a fixture per test burns through it.
 */
export async function createRlsFixture(count: number): Promise<RlsFixture> {
  const env = requireEnv();

  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const users: TestUser[] = [];

  // Tracked separately from `users` so that an account created a moment before
  // something else failed still gets deleted -- it exists in auth.users whether
  // or not it ever became a usable TestUser.
  const createdIds: string[] = [];

  const cleanup = async () => {
    for (const id of createdIds.splice(0).reverse()) {
      await admin.auth.admin.deleteUser(id);
    }
    users.length = 0;
  };

  try {
    for (let index = 0; index < count; index += 1) {
      const suffix = uniqueSuffix();
      const email = `rls-${suffix}@roamr.test`;
      const username = `rls_${suffix}`;
      const displayName = `RLS ${index + 1}`;

      const created = await admin.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        // No inbox in the CI stack, and confirmation is not what is under test.
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        throw new Error(`Could not create test user: ${created.error?.message ?? "no user"}`);
      }
      const id = created.data.user.id;
      createdIds.push(id);

      // The profile row already exists -- an auth.users trigger makes it -- so
      // this only claims the username that the add-a-friend flow resolves.
      const profile = await admin
        .from("profiles")
        .update({ username, display_name: displayName })
        .eq("id", id);
      if (profile.error) {
        throw new Error(`Could not claim a username for the test user: ${profile.error.message}`);
      }

      const db = createClient(env.url, env.anonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const session = await db.auth.signInWithPassword({ email, password: TEST_PASSWORD });
      if (session.error) {
        throw new Error(`Could not sign in as the test user: ${session.error.message}`);
      }

      users.push({ id, email, username, displayName, db });
    }
  } catch (cause) {
    await cleanup();
    throw cause;
  }

  return { admin, users, cleanup };
}

/** Delete every row of `table` whose `column` is one of `ids`. Resets between cases. */
export async function deleteRowsFor(
  admin: SupabaseClient,
  table: string,
  column: string,
  ids: readonly string[],
): Promise<void> {
  const { error } = await admin.from(table).delete().in(column, ids);
  if (error) throw new Error(`Could not clear ${table}.${column}: ${error.message}`);
}

/** The shape every PostgREST call returns, narrowed to what assertions need. */
export interface PostgrestLike {
  data: unknown;
  error: { code?: string; message: string } | null;
}

/**
 * Errors that mean "the policy said no".
 *
 * `42501` is what a failed WITH CHECK or a missing column grant surfaces as. A
 * failed USING clause raises nothing at all -- the row is simply not visible to
 * the statement -- which is why `expectDenied` treats zero affected rows as a
 * denial too, and why every update test here also reads the row back to prove
 * it did not change.
 *
 * `23514` covers the third way a write gets refused: a trigger or constraint
 * raising check_violation. Some rules cannot be expressed as a policy at all --
 * "this column may not change" needs to compare the new row against the old
 * one, and `with check` only ever sees the new one -- so those are enforced by
 * a trigger instead (see 20260108000000_friendships_immutable_identity.sql).
 * That is still the database refusing the statement, and the assertion should
 * read it as such rather than as an unexpected error.
 */
const RLS_DENIAL_CODES: ReadonlySet<string> = new Set(["42501", "PGRST301", "23514"]);

function rowCount(result: PostgrestLike): number {
  if (result.data === null || result.data === undefined) return 0;
  return Array.isArray(result.data) ? result.data.length : 1;
}

/** Assert that a statement was refused, whichever of the two ways that happens. */
export function expectDenied(result: PostgrestLike, what: string): void {
  if (result.error) {
    const code = result.error.code ?? "";
    expect(
      RLS_DENIAL_CODES.has(code),
      `${what}: expected a policy denial, got ${code}: ${result.error.message}`,
    ).toBe(true);
    return;
  }

  expect(rowCount(result), `${what}: the statement was allowed through`).toBe(0);
}

/** Assert that a statement succeeded, reporting the database's message if not. */
export function expectAllowed(result: PostgrestLike, what: string): void {
  expect(result.error?.message ?? null, `${what}: ${result.error?.message ?? ""}`).toBeNull();
}

/** Assert a statement succeeded and touched exactly `count` rows. */
export function expectRowCount(result: PostgrestLike, count: number, what: string): void {
  expectAllowed(result, what);
  expect(rowCount(result), `${what}: wrong number of rows`).toBe(count);
}
