import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GeocodeResult } from "@/lib/geocoding/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findCityByProviderPlaceId, resolveCity } from "../resolve";
import type { CityRow } from "../types";

// Factories, so the real modules -- and `server-only`, and `next/headers` --
// are never evaluated in jsdom.
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const CHICAGO: GeocodeResult = {
  providerPlaceId: "place.9757815470331290",
  name: "Chicago",
  admin1: "Illinois",
  countryCode: "US",
  displayName: "Chicago, Illinois",
  lat: 41.8756,
  lng: -87.6244,
};

const TOKYO: GeocodeResult = {
  providerPlaceId: "place.9666437979919480",
  name: "Tokyo",
  admin1: "Tokyo",
  countryCode: "JP",
  displayName: "Tokyo, Japan",
  lat: 35.6895,
  lng: 139.6917,
};

type Payload = Record<string, unknown>;

interface UpsertCall {
  payload: Payload;
  options: { onConflict?: string; ignoreDuplicates?: boolean } | undefined;
}

/**
 * Stands in for Postgres closely enough to prove the dedupe: keyed on
 * (provider, provider_place_id) exactly like the unique constraint.
 *
 * It models ON CONFLICT DO NOTHING faithfully, including the part that shapes
 * the calling code -- a conflicting write returns *no row*, which is why
 * resolveCity has to read the existing one back rather than trusting what the
 * write handed it.
 */
function createFakeDatabase() {
  const rows = new Map<string, CityRow>();
  const upsertCalls: UpsertCall[] = [];
  const insert = vi.fn();
  const update = vi.fn();
  const selectFilters: Payload = {};
  let nextId = 1;

  const key = (payload: Payload) =>
    `${String(payload.provider)}|${String(payload.provider_place_id)}`;

  const from = vi.fn((table: string) => {
    expect(table).toBe("cities");
    return {
      insert,
      update,
      upsert(payload: Payload, options?: UpsertCall["options"]) {
        upsertCalls.push({ payload, options });

        const conflicted = rows.has(key(payload));
        if (conflicted && options?.ignoreDuplicates) {
          // DO NOTHING: the stored row is left exactly as it was.
          return { select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) };
        }

        const stored = {
          ...(rows.get(key(payload)) ?? {
            id: `city-${nextId++}`,
            created_at: "2026-01-03T00:00:00.000Z",
          }),
          ...payload,
        } as CityRow;
        rows.set(key(payload), stored);
        return {
          select: () => ({ maybeSingle: async () => ({ data: stored, error: null }) }),
        };
      },
      select: () => {
        const builder = {
          eq(column: string, value: unknown) {
            selectFilters[column] = value;
            return builder;
          },
          maybeSingle: async () => ({ data: rows.get(key(selectFilters)) ?? null, error: null }),
        };
        return builder;
      },
    };
  });

  return { client: { from }, from, insert, update, upsertCalls, rows, selectFilters };
}

/**
 * resolveCity writes with the admin client and reads the conflict path back
 * with the request-scoped one, so both point at the same fake database.
 */
function useDatabase(db: ReturnType<typeof createFakeDatabase>) {
  vi.mocked(createAdminClient).mockReturnValue(db.client as never);
  vi.mocked(createClient).mockResolvedValue(db.client as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveCity", () => {
  it("upserts onto the unique constraint that backs the dedupe", async () => {
    const db = createFakeDatabase();
    useDatabase(db);

    await resolveCity(CHICAGO, "mapbox");

    expect(db.upsertCalls).toHaveLength(1);
    expect(db.upsertCalls[0]?.options).toEqual({
      onConflict: "provider,provider_place_id",
      ignoreDuplicates: true,
    });
    expect(db.upsertCalls[0]?.payload).toEqual({
      provider: "mapbox",
      provider_place_id: "place.9757815470331290",
      name: "Chicago",
      admin1: "Illinois",
      country_code: "US",
      display_name: "Chicago, Illinois",
      lat: 41.8756,
      lng: -87.6244,
    });
  });

  /**
   * The whole point of the table. Two people adding Chicago must end up on one
   * row -- if this ever regresses to insert-if-missing, their collections
   * silently stop being the same place.
   */
  it("gives two callers adding the same place the same row, and never inserts", async () => {
    const db = createFakeDatabase();
    useDatabase(db);

    const first = await resolveCity(CHICAGO, "mapbox");
    const second = await resolveCity(CHICAGO, "mapbox");

    expect(second.id).toBe(first.id);
    expect(db.rows.size).toBe(1);
    expect(db.upsertCalls).toHaveLength(2);
    expect(
      db.upsertCalls.every((call) => call.options?.onConflict === "provider,provider_place_id"),
    ).toBe(true);
    // A read-then-insert would race two concurrent callers into two Chicagos.
    expect(db.insert).not.toHaveBeenCalled();
  });

  /**
   * The reason this is ON CONFLICT DO NOTHING rather than DO UPDATE.
   *
   * `cities` is the one globally shared table -- row level security contains
   * per-user damage everywhere else, but a write here lands for everybody. The
   * coordinates arrive from the browser, so a signed-in user could post a real
   * place id with wrong coordinates and relocate Chicago for every account. An
   * upsert that updates would accept that; first-writer-wins does not.
   *
   * It also protects the challenge matcher, which falls back to the city
   * centroid when a Moment has no pin: a poisoned centroid would mis-credit
   * national parks and get diagnosed as a matcher bug rather than bad data.
   */
  it("refuses to let a later caller change an existing city's coordinates", async () => {
    const db = createFakeDatabase();
    useDatabase(db);

    const original = await resolveCity(CHICAGO, "mapbox");
    const relocated = await resolveCity(
      { ...CHICAGO, lat: 0, lng: 0, name: "Not Chicago", displayName: "Not Chicago" },
      "mapbox",
    );

    expect(relocated.id).toBe(original.id);
    expect(relocated.lat).toBe(CHICAGO.lat);
    expect(relocated.lng).toBe(CHICAGO.lng);
    expect(relocated.display_name).toBe("Chicago, Illinois");
    expect(db.rows.size).toBe(1);
    // No path from user input to mutating a shared row.
    expect(db.update).not.toHaveBeenCalled();
  });

  it("returns the existing row when the write conflicts and yields nothing", async () => {
    const db = createFakeDatabase();
    useDatabase(db);

    const first = await resolveCity(CHICAGO, "mapbox");
    const second = await resolveCity(CHICAGO, "mapbox");

    // Second write returned no row; the value came from reading it back.
    expect(db.upsertCalls[1]?.options?.ignoreDuplicates).toBe(true);
    expect(second).toEqual(first);
  });

  it("keeps different places apart", async () => {
    const db = createFakeDatabase();
    useDatabase(db);

    const chicago = await resolveCity(CHICAGO, "mapbox");
    const tokyo = await resolveCity(TOKYO, "mapbox");

    expect(tokyo.id).not.toBe(chicago.id);
    expect(db.rows.size).toBe(2);
  });

  /**
   * Place ids are only unique within the geocoder that issued them, so the
   * provider has to be part of the key.
   */
  it("does not collapse the same id from two different providers", async () => {
    const db = createFakeDatabase();
    useDatabase(db);

    const a = await resolveCity(CHICAGO, "mapbox");
    const b = await resolveCity(CHICAGO, "fake");

    expect(b.id).not.toBe(a.id);
    expect(db.rows.size).toBe(2);
  });

  it("never writes the generated geometry column", async () => {
    const db = createFakeDatabase();
    useDatabase(db);

    await resolveCity(CHICAGO, "mapbox");

    expect(db.upsertCalls[0]?.payload).not.toHaveProperty("geom");
  });

  it("writes through the admin client, the only role the table has a policy for", async () => {
    const db = createFakeDatabase();
    useDatabase(db);

    await resolveCity(CHICAGO, "mapbox");

    expect(createAdminClient).toHaveBeenCalledTimes(1);
  });

  it("surfaces a database error with the city in the message", async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: () => ({
        upsert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: { message: "permission denied" } }),
          }),
        }),
      }),
    } as never);

    await expect(resolveCity(CHICAGO, "mapbox")).rejects.toThrow(
      /Chicago, Illinois.*permission denied/,
    );
  });
});

describe("findCityByProviderPlaceId", () => {
  it("reads through the request-scoped client so RLS still applies", async () => {
    const db = createFakeDatabase();
    useDatabase(db);
    await resolveCity(CHICAGO, "mapbox");

    vi.mocked(createClient).mockResolvedValue(db.client as never);
    const found = await findCityByProviderPlaceId(CHICAGO.providerPlaceId, "mapbox");

    expect(found?.display_name).toBe("Chicago, Illinois");
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it("returns null for a place nobody has added yet", async () => {
    const db = createFakeDatabase();
    vi.mocked(createClient).mockResolvedValue(db.client as never);

    expect(await findCityByProviderPlaceId("place.unknown", "mapbox")).toBeNull();
  });
});
