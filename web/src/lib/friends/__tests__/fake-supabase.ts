import type { FriendshipRow } from "../types";

/**
 * A Supabase client that stands in for Postgres closely enough to be worth
 * asserting against.
 *
 * The parts that are modelled are the ones that shape the calling code: the
 * primary key on (user_a, user_b) rejecting a duplicate pair with a 23505, and
 * the `user_a < user_b` check constraint rejecting an unordered insert with a
 * 23514. A fake that accepted anything would let the action forget to order the
 * pair and still pass, which is the one bug these tests exist to catch.
 *
 * It is not a database. Nothing here proves a policy holds -- that is what the
 * live-database tests in this directory are for.
 */

export interface FakeProfileRow {
  id: string;
  username: string | null;
  display_name: string | null;
}

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "neq" | "in" | "or"; column: string; value: unknown };
type Operation = "select" | "insert" | "update" | "delete";

export interface FakeError {
  code: string;
  message: string;
}

export interface FakeCall {
  table: string;
  operation: Operation;
  payload?: Row;
  filters: Filter[];
}

export interface FakeDatabase {
  profiles: FakeProfileRow[];
  friendships: FriendshipRow[];
  calls: FakeCall[];
  /**
   * Runs immediately before an insert reaches the store. The hook is how a race
   * is expressed: it lets another request land in the window between the
   * action's "does a row exist?" check and its insert.
   */
  beforeInsert?: () => void;
  client: FakeClient;
}

export interface FakeClient {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  from: (table: string) => FakeTable;
}

interface FakeResult {
  data: unknown;
  error: FakeError | null;
}

interface FakeBuilder extends PromiseLike<FakeResult> {
  select: (columns?: string) => FakeBuilder;
  eq: (column: string, value: unknown) => FakeBuilder;
  neq: (column: string, value: unknown) => FakeBuilder;
  in: (column: string, values: unknown[]) => FakeBuilder;
  or: (expression: string) => FakeBuilder;
  order: (column: string, options?: { ascending?: boolean }) => FakeBuilder;
  maybeSingle: () => Promise<FakeResult>;
}

interface FakeTable {
  select: (columns?: string) => FakeBuilder;
  insert: (payload: Row) => FakeBuilder;
  update: (payload: Row) => FakeBuilder;
  delete: () => FakeBuilder;
}

const PRIMARY_KEYS: Record<string, readonly string[]> = {
  friendships: ["user_a", "user_b"],
  profiles: ["id"],
};

export function createFakeDatabase(currentUserId: string | null): FakeDatabase {
  const state: FakeDatabase = {
    profiles: [],
    friendships: [],
    calls: [],
    client: undefined as unknown as FakeClient,
  };

  const rowsFor = (table: string): Row[] => {
    if (table === "profiles") return state.profiles as unknown as Row[];
    if (table === "friendships") return state.friendships as unknown as Row[];
    throw new Error(`The fake database knows nothing about "${table}"`);
  };

  function makeBuilder(table: string, operation: Operation, payload?: Row): FakeBuilder {
    const filters: Filter[] = [];
    const sorts: { column: string; ascending: boolean }[] = [];
    let projection: ReturnType<typeof parseColumns> | null = null;
    let returning = operation === "select";

    const record = () => {
      state.calls.push({ table, operation, payload, filters: [...filters] });
    };

    const run = (): FakeResult => {
      record();
      const rows = rowsFor(table);

      if (operation === "insert") {
        state.beforeInsert?.();
        const row = { ...payload } as Row;

        if (table === "friendships" && String(row.user_a) >= String(row.user_b)) {
          return {
            data: null,
            error: {
              code: "23514",
              message: 'new row violates check constraint "friendships_canonical_order"',
            },
          };
        }

        const keys = PRIMARY_KEYS[table] ?? [];
        const clash = rows.some((existing) => keys.every((key) => existing[key] === row[key]));
        if (clash) {
          return {
            data: null,
            error: {
              code: "23505",
              message: `duplicate key value violates unique constraint "${table}_pkey"`,
            },
          };
        }

        rows.push(row);
        return { data: returning ? [project(row, projection)] : null, error: null };
      }

      const matched = rows.filter((row) => filters.every((filter) => matches(row, filter)));

      if (operation === "update") {
        for (const row of matched) Object.assign(row, payload);
      }

      if (operation === "delete") {
        for (const row of matched) rows.splice(rows.indexOf(row), 1);
      }

      const sorted = [...matched];
      for (const sort of [...sorts].reverse()) {
        sorted.sort((left, right) => {
          const a = String(left[sort.column] ?? "");
          const b = String(right[sort.column] ?? "");
          return sort.ascending ? a.localeCompare(b) : b.localeCompare(a);
        });
      }

      return {
        data: returning ? sorted.map((row) => project(row, projection)) : null,
        error: null,
      };
    };

    const builder: FakeBuilder = {
      select(columns?: string) {
        returning = true;
        // PostgREST aliases (`displayName:display_name`) are how the real
        // queries bridge snake_case and camelCase, so the fake has to honour
        // them -- otherwise every aliased column reads back as undefined and
        // the tests would be asserting against a shape production never sees.
        projection = parseColumns(columns);
        return builder;
      },
      eq(column, value) {
        filters.push({ op: "eq", column, value });
        return builder;
      },
      neq(column, value) {
        filters.push({ op: "neq", column, value });
        return builder;
      },
      in(column, values) {
        filters.push({ op: "in", column, value: values });
        return builder;
      },
      or(expression) {
        filters.push({ op: "or", column: "", value: expression });
        return builder;
      },
      order(column, options) {
        sorts.push({ column, ascending: options?.ascending ?? true });
        return builder;
      },
      async maybeSingle() {
        const result = run();
        if (result.error) return result;
        const rows = (result.data ?? []) as Row[];
        if (rows.length > 1) {
          return {
            data: null,
            error: { code: "PGRST116", message: "more than one row returned" },
          };
        }
        return { data: rows[0] ?? null, error: null };
      },
      then(onfulfilled, onrejected) {
        return Promise.resolve(run()).then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  state.client = {
    auth: {
      getUser: async () => ({ data: { user: currentUserId ? { id: currentUserId } : null } }),
    },
    from: (table: string): FakeTable => ({
      select: (columns?: string) => makeBuilder(table, "select", undefined).select(columns),
      insert: (payload: Row) => makeBuilder(table, "insert", payload),
      update: (payload: Row) => makeBuilder(table, "update", payload),
      delete: () => makeBuilder(table, "delete"),
    }),
  };

  return state;
}

interface ProjectedColumn {
  alias: string;
  source: string;
}

/** Parse a PostgREST select list, honouring `alias:source` pairs. */
function parseColumns(columns: string | undefined): ProjectedColumn[] | null {
  if (!columns || columns.trim() === "*") return null;
  return columns.split(",").map((entry) => {
    const [left, right] = entry.split(":").map((part) => part.trim());
    return right ? { alias: left, source: right } : { alias: left, source: left };
  });
}

function project(row: Row, projection: ProjectedColumn[] | null): Row {
  if (!projection) return { ...row };
  const out: Row = {};
  for (const column of projection) out[column.alias] = row[column.source];
  return out;
}

/** `or("user_a.eq.X,user_b.eq.Y")`, which is the only or-expression in this feature. */
function matchesOr(row: Row, expression: string): boolean {
  return expression.split(",").some((clause) => {
    const [column, op, value] = clause.split(".");
    if (op !== "eq") throw new Error(`The fake database cannot parse "${clause}"`);
    return row[column] === value;
  });
}

function matches(row: Row, filter: Filter): boolean {
  switch (filter.op) {
    case "eq":
      return row[filter.column] === filter.value;
    case "neq":
      return row[filter.column] !== filter.value;
    case "in":
      return (filter.value as unknown[]).includes(row[filter.column]);
    case "or":
      return matchesOr(row, String(filter.value));
  }
}
