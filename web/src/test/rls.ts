import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect } from "vitest";

/** Harness for row level security tests. */

export interface RlsEnvironment {
  url: string;
  /** Public key. */
  anonKey: string;
  /** Bypasses RLS. */
  serviceRoleKey: string;
}

/** Test-harness configuration. */
export function rlsEnvironment(): RlsEnvironment | null {
  const url = process.env.SUPABASE_TEST_URL;
  const anonKey = process.env.SUPABASE_TEST_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceRoleKey) return null;
  return { url, anonKey, serviceRoleKey };
}

export const RLS_ENV = rlsEnvironment();

/** Whether a database is reachable. */
export const rlsEnabled = RLS_ENV !== null;

export const RLS_SKIP_REASON =
  "needs a database: set SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY and SUPABASE_TEST_SERVICE_ROLE_KEY";

export interface TestUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  /** A client holding this person's session and the anon key. */
  db: SupabaseClient;
}

export interface RlsFixture {
  /** Service-role client. */
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

/** Create `count` signed-in people, each with their own client. */
export async function createRlsFixture(count: number): Promise<RlsFixture> {
  const env = requireEnv();

  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const users: TestUser[] = [];

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

      // The profile row already exists.
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

/** Delete every row of `table` whose `column` is one of `ids`. */
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

/** Errors that mean "the policy said no". */
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
