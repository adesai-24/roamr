import { describe, expect, it } from "vitest";
import {
  CHALLENGES_MIGRATION,
  SEED_FILES,
  parseSqlValuesTables,
  readMigrationFile,
  readSeedChallenges,
  readSeedFile,
  readSeedTargets,
  stripSqlComments,
  type SeedFileName,
  type SeedTarget,
} from "../seed-catalog";

/** The seeds cannot be applied without Docker. */

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Independent expectation, deliberately not derived from the seed file.
const US_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
];

const TARGET_FILES: { file: SeedFileName; challenge: string; count: number }[] = [
  { file: SEED_FILES.nationalParks, challenge: "us-national-parks", count: 63 },
  { file: SEED_FILES.new7wonders, challenge: "new7wonders", count: 7 },
  { file: SEED_FILES.usStates, challenge: "us-50-states", count: 50 },
  { file: SEED_FILES.usBucketList, challenge: "us-bucket-list", count: 30 },
];

const allTargets: { file: SeedFileName; targets: SeedTarget[] }[] = TARGET_FILES.map(
  ({ file }) => ({
    file,
    targets: readSeedTargets(file),
  }),
);

describe("values-list parser", () => {
  it("reads quoted, numeric and null fields", () => {
    const [table] = parseSqlValuesTables(
      "select * from (values ('a', 1, -2.5, null)) as v (slug, n, coord, note)",
    );
    expect(table.columns).toEqual(["slug", "n", "coord", "note"]);
    expect(table.rows).toEqual([{ slug: "a", n: 1, coord: -2.5, note: null }]);
  });

  it("keeps commas and doubled quotes inside string literals", () => {
    const [table] = parseSqlValuesTables(
      "select * from (values ('Ma''an, Jordan')) as v (name) -- ('not', 'a', 'row')",
    );
    expect(table.rows).toEqual([{ name: "Ma'an, Jordan" }]);
  });

  it("refuses a literal it cannot verify rather than skipping it", () => {
    expect(() => parseSqlValuesTables("select * from (values (now())) as v (t)")).toThrow(
      /Unsupported SQL literal/,
    );
  });
});

describe("challenge catalog", () => {
  const challenges = readSeedChallenges();

  it("seeds exactly the four v1 challenges", () => {
    expect(challenges.map((challenge) => challenge.slug).sort()).toEqual([
      "new7wonders",
      "us-50-states",
      "us-bucket-list",
      "us-national-parks",
    ]);
  });

  it("gives every challenge a kebab-case slug, a title and a sort order", () => {
    for (const challenge of challenges) {
      expect(challenge.slug).toMatch(KEBAB_CASE);
      expect(challenge.title.length).toBeGreaterThan(0);
      expect(challenge.sortOrder).toBeTypeOf("number");
    }
  });

  it("has a target file for every challenge and a challenge for every target file", () => {
    expect(TARGET_FILES.map((entry) => entry.challenge).sort()).toEqual(
      challenges.map((challenge) => challenge.slug).sort(),
    );
  });

  it("derives target_count in the seeds instead of hard-coding it", () => {
    expect(stripSqlComments(readSeedFile(SEED_FILES.challenges))).not.toContain("target_count");
    for (const { file } of TARGET_FILES) {
      const sql = readSeedFile(file);
      expect(sql).toContain("set target_count = counted.n");
      expect(sql).toContain("count(*)::int as n");
    }
  });

  it("upserts rather than inserts, so re-seeding is a no-op", () => {
    for (const file of Object.values(SEED_FILES)) {
      const sql = readSeedFile(file);
      expect(sql).toContain("on conflict");
      expect(sql).toContain("do update set");
      expect(sql).toContain("is distinct from");
    }
  });
});

describe.each(TARGET_FILES)("$challenge targets", ({ file, count }) => {
  const targets = readSeedTargets(file);

  it(`seeds exactly ${count} targets`, () => {
    expect(targets).toHaveLength(count);
  });

  it("uses unique kebab-case slugs", () => {
    for (const target of targets) {
      expect(target.slug, `${target.name} has a non-kebab slug`).toMatch(KEBAB_CASE);
    }
    expect(new Set(targets.map((target) => target.slug)).size).toBe(targets.length);
  });

  it("uses unique names and a contiguous sort order", () => {
    expect(new Set(targets.map((target) => target.name)).size).toBe(targets.length);
    expect(targets.map((target) => target.sortOrder)).toEqual(
      Array.from({ length: targets.length }, (_, index) => index + 1),
    );
  });

  it("keeps every coordinate on the planet", () => {
    for (const target of targets) {
      expect(target.lat, `${target.name} latitude`).not.toBeNull();
      expect(target.lng, `${target.name} longitude`).not.toBeNull();
      expect(target.lat, `${target.name} latitude`).toBeGreaterThanOrEqual(-90);
      expect(target.lat, `${target.name} latitude`).toBeLessThanOrEqual(90);
      expect(target.lng, `${target.name} longitude`).toBeGreaterThanOrEqual(-180);
      expect(target.lng, `${target.name} longitude`).toBeLessThanOrEqual(180);
    }
  });

  it("gives radius targets a point and a positive radius, and name targets a match value", () => {
    for (const target of targets) {
      if (target.matchMode === "radius") {
        expect(target.lat, `${target.name} latitude`).toBeTypeOf("number");
        expect(target.lng, `${target.name} longitude`).toBeTypeOf("number");
        expect(target.radiusM, `${target.name} radius_m`).toBeGreaterThan(0);
      } else {
        expect(target.matchValue, `${target.name} match_value`).toBeTruthy();
      }
    }
  });

  it("names a country for every target", () => {
    for (const target of targets) {
      expect(target.countryCode, `${target.name} country_code`).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe("coordinate signs", () => {
  it("puts every US target in the western hemisphere", () => {
    // The failure this exists for.
    const usTargets = allTargets
      .flatMap(({ targets }) => targets)
      .filter((target) => target.countryCode === "US");

    expect(usTargets.length).toBeGreaterThan(140);
    for (const target of usTargets) {
      expect(target.lng, `${target.name} should have a negative longitude`).toBeLessThan(0);
    }
  });

  it("does not assume the world is American", () => {
    const wonders = readSeedTargets(SEED_FILES.new7wonders);
    expect(wonders.some((target) => (target.lng ?? 0) > 0)).toBe(true);
    expect(wonders.some((target) => (target.lat ?? 0) < 0)).toBe(true);
    expect(wonders.every((target) => target.countryCode !== "US")).toBe(true);
  });
});

describe("us-50-states", () => {
  const states = readSeedTargets(SEED_FILES.usStates);

  it("covers all fifty states exactly once", () => {
    expect(states.map((state) => state.name).sort()).toEqual([...US_STATES].sort());
  });

  it("matches on the full state name a geocoder returns, not the postal code", () => {
    for (const state of states) {
      expect(state.matchMode).toBe("admin1");
      expect(state.matchValue).toBe(state.name);
      expect(US_STATES).toContain(state.matchValue);
    }
  });

  it("carries no radius, because a state is not a circle", () => {
    for (const state of states) {
      expect(state.radiusM, `${state.name} radius_m`).toBeNull();
    }
  });
});

describe("radius sizing", () => {
  const parks = readSeedTargets(SEED_FILES.nationalParks);
  const radiusOf = (slug: string) => {
    const target = parks.find((park) => park.slug === slug);
    if (!target) throw new Error(`No national park seeded with slug ${slug}`);
    return target.radiusM ?? 0;
  };

  it("scales the radius with the park, rather than using one constant", () => {
    const radii = new Set(parks.map((park) => park.radiusM));
    expect(radii.size).toBeGreaterThan(5);
    expect(radiusOf("wrangell-st-elias")).toBeGreaterThan(radiusOf("hot-springs") * 10);
    expect(radiusOf("yellowstone")).toBeGreaterThan(radiusOf("gateway-arch") * 10);
  });
});

describe("challenges migration", () => {
  const sql = readMigrationFile(CHALLENGES_MIGRATION);
  const tables = [
    "challenges",
    "challenge_targets",
    "user_challenges",
    "challenge_completions",
    "challenge_dismissals",
  ];

  it.each(tables)("enables row level security on %s", (table) => {
    expect(sql).toContain(`alter table public.${table} enable row level security;`);
  });

  it("scopes progress to its owner", () => {
    for (const table of ["user_challenges", "challenge_completions", "challenge_dismissals"]) {
      const policies = sql.split(`on public.${table}\n`).length - 1;
      expect(policies, `${table} needs select/insert/update/delete policies`).toBe(4);
    }
    expect(sql).toContain("auth.uid() = user_id");
  });

  it("leaves moment_id without a foreign key until the moments table exists", () => {
    expect(sql).not.toMatch(/moment_id[^,\n]*references/);
  });
});
