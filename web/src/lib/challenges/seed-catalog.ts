import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Reads the challenge catalog straight out of `supabase/seeds/*.sql`.
 *
 * The catalog is seed data, so the usual way to check it would be to apply the
 * seeds and query the result. That needs Docker, which puts it in CI only, and
 * the failure this guards against -- a coordinate with the wrong sign, a park
 * that quietly went missing, a slug typo -- is exactly the kind that applies
 * cleanly and is wrong anyway. Parsing the `values` lists gets those assertions
 * into `npm test`, where they run on every change in a second.
 *
 * The parser understands only what the seeds actually use: string literals with
 * doubled-quote escapes, numbers, and `null`. Anything else throws rather than
 * being skipped, so a seed the tests cannot read is a failing test and not a
 * silently unchecked one.
 */

export type SqlLiteral = string | number | null;

/** One `(values ...) as alias (columns...)` block, keyed by column name. */
export interface SqlValuesTable {
  columns: string[];
  rows: Record<string, SqlLiteral>[];
}

export type MatchMode = "radius" | "admin1" | "city";

export interface SeedChallenge {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  category: string | null;
  coverPath: string | null;
  sortOrder: number | null;
}

export interface SeedTarget {
  slug: string;
  name: string;
  subtitle: string | null;
  lat: number | null;
  lng: number | null;
  matchMode: MatchMode;
  matchValue: string | null;
  radiusM: number | null;
  admin1: string | null;
  countryCode: string | null;
  sortOrder: number | null;
}

export const SEED_FILES = {
  challenges: "010_challenges.sql",
  nationalParks: "020_challenge_targets_national_parks.sql",
  new7wonders: "030_challenge_targets_new7wonders.sql",
  usStates: "040_challenge_targets_us_states.sql",
  usBucketList: "050_challenge_targets_us_bucket_list.sql",
} as const;

export type SeedFileName = (typeof SEED_FILES)[keyof typeof SEED_FILES];

export const CHALLENGES_MIGRATION = "20260104000000_challenges.sql";

/**
 * Walk up from the working directory rather than resolving relative to this
 * file, so the helper works from `web/` (vitest) and from the repo root alike.
 */
function repoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(path.join(dir, "supabase", "seeds"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find supabase/seeds above ${process.cwd()}`);
    }
    dir = parent;
  }
}

export function readSeedFile(fileName: SeedFileName): string {
  return readFileSync(path.join(repoRoot(), "supabase", "seeds", fileName), "utf8");
}

export function readMigrationFile(fileName: string): string {
  return readFileSync(path.join(repoRoot(), "supabase", "migrations", fileName), "utf8");
}

/**
 * Remove `--` and block comments, keeping newlines so error offsets stay
 * roughly meaningful. Quote-aware: a comment marker inside a string literal is
 * data, not a comment.
 */
export function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      const end = endOfStringLiteral(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      // Preserve newlines so the stripped text keeps the same line count.
      out += sql.slice(i, stop).replace(/[^\n]/g, "");
      i = stop;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** Index just past the closing quote of the literal starting at `start`. */
function endOfStringLiteral(sql: string, start: number): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === "'") {
      if (sql[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  throw new Error(`Unterminated string literal at offset ${start}`);
}

/** Index of the `)` matching the `(` at `open`. */
function matchingParen(sql: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      i = endOfStringLiteral(sql, i);
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") {
      depth -= 1;
      if (depth === 0) return i;
    }
    i += 1;
  }
  throw new Error(`Unbalanced parentheses starting at offset ${open}`);
}

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      const end = endOfStringLiteral(text, i);
      current += text.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  parts.push(current);
  return parts;
}

function parseLiteral(raw: string): SqlLiteral {
  const token = raw.trim();
  if (/^null$/i.test(token)) return null;
  if (token.startsWith("'")) {
    if (endOfStringLiteral(token, 0) !== token.length) {
      throw new Error(`Expected a single string literal, got: ${token}`);
    }
    return token.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
  throw new Error(`Unsupported SQL literal in seed data: ${token}`);
}

/** Every `(values ...) as alias (cols)` block in a statement, in file order. */
export function parseSqlValuesTables(sql: string): SqlValuesTable[] {
  const stripped = stripSqlComments(sql);
  const tables: SqlValuesTable[] = [];
  const opener = /\(\s*values\b/gi;
  let match: RegExpExecArray | null;

  while ((match = opener.exec(stripped)) !== null) {
    const open = match.index;
    const close = matchingParen(stripped, open);
    const body = stripped.slice(open + match[0].length, close);

    const alias = /^\s*(?:as\s+)?[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/i.exec(
      stripped.slice(close + 1),
    );
    if (!alias) {
      throw new Error("A (values ...) block is missing its `as alias (columns)` list");
    }
    const columns = alias[1].split(",").map((column) => column.trim());

    const rows = splitTopLevel(body, ",")
      .map((tuple) => tuple.trim())
      .filter((tuple) => tuple.length > 0)
      .map((tuple) => {
        if (!tuple.startsWith("(") || !tuple.endsWith(")")) {
          throw new Error(`Expected a parenthesised row, got: ${tuple}`);
        }
        const fields = splitTopLevel(tuple.slice(1, -1), ",").map(parseLiteral);
        if (fields.length !== columns.length) {
          throw new Error(
            `Row has ${fields.length} values but the alias declares ${columns.length} columns: ${tuple}`,
          );
        }
        return Object.fromEntries(columns.map((column, index) => [column, fields[index]]));
      });

    tables.push({ columns, rows });
    opener.lastIndex = close;
  }

  return tables;
}

function requireString(row: Record<string, SqlLiteral>, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`Expected ${column} to be a string, got ${JSON.stringify(value)}`);
  }
  return value;
}

function optionalString(row: Record<string, SqlLiteral>, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`Expected ${column} to be a string or null, got ${JSON.stringify(value)}`);
  }
  return value;
}

function optionalNumber(row: Record<string, SqlLiteral>, column: string): number | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") {
    throw new Error(`Expected ${column} to be a number or null, got ${JSON.stringify(value)}`);
  }
  return value;
}

function toMatchMode(value: string): MatchMode {
  if (value === "radius" || value === "admin1" || value === "city") return value;
  throw new Error(`Unknown match_mode in seed data: ${value}`);
}

/** The four rows of `010_challenges.sql`. */
export function readSeedChallenges(): SeedChallenge[] {
  const [table] = parseSqlValuesTables(readSeedFile(SEED_FILES.challenges));
  if (!table) throw new Error(`No values block found in ${SEED_FILES.challenges}`);
  return table.rows.map((row) => ({
    slug: requireString(row, "slug"),
    title: requireString(row, "title"),
    subtitle: optionalString(row, "subtitle"),
    description: optionalString(row, "description"),
    category: optionalString(row, "category"),
    coverPath: optionalString(row, "cover_path"),
    sortOrder: optionalNumber(row, "sort_order"),
  }));
}

/** The target rows of one `challenge_targets` seed file. */
export function readSeedTargets(fileName: SeedFileName): SeedTarget[] {
  const [table] = parseSqlValuesTables(readSeedFile(fileName));
  if (!table) throw new Error(`No values block found in ${fileName}`);
  return table.rows.map((row) => ({
    slug: requireString(row, "slug"),
    name: requireString(row, "name"),
    subtitle: optionalString(row, "subtitle"),
    lat: optionalNumber(row, "lat"),
    lng: optionalNumber(row, "lng"),
    matchMode: toMatchMode(requireString(row, "match_mode")),
    matchValue: optionalString(row, "match_value"),
    radiusM: optionalNumber(row, "radius_m"),
    admin1: optionalString(row, "admin1"),
    countryCode: optionalString(row, "country_code"),
    sortOrder: optionalNumber(row, "sort_order"),
  }));
}
