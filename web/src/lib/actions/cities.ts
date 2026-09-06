"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { CITY_CATALOG, type CatalogCity } from "@/lib/cities-catalog";

export interface CityRow {
  id: string;
  name: string;
  region: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
}

/**
 * Search-or-create against the `cities` table, deduped by name+country. This
 * is the only place that writes a `cities` row -- always via the admin
 * client, per CLAUDE.md's convention that shared data no individual user
 * owns goes through resolveCity() (analogous to the signed-URL helper for
 * photos). Real geocoding is out of scope for the demo; `city` must come
 * from the hardcoded CITY_CATALOG so we always have real coordinates and a
 * consistent country string.
 */
export async function resolveCity(city: CatalogCity): Promise<CityRow> {
  const admin = createAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from("cities")
    .select("id, name, region, country, lat, lng")
    .eq("name", city.name)
    .eq("country", city.country)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing) return existing;

  const { data: created, error: insertError } = await admin
    .from("cities")
    .insert({
      name: city.name,
      region: city.region,
      country: city.country,
      lat: city.lat,
      lng: city.lng,
    })
    .select("id, name, region, country, lat, lng")
    .single();
  if (insertError) {
    // Another concurrent request created the same (name, country) row first.
    if (insertError.code === "23505") {
      const { data: raced, error: racedError } = await admin
        .from("cities")
        .select("id, name, region, country, lat, lng")
        .eq("name", city.name)
        .eq("country", city.country)
        .single();
      if (racedError) throw new Error(racedError.message);
      return raced;
    }
    throw new Error(insertError.message);
  }
  return created;
}

/** Case-insensitive substring match against the seeded catalog, for the city picker's search box. */
export async function searchCityCatalog(query: string): Promise<CatalogCity[]> {
  const q = query.trim().toLowerCase();
  if (!q) return CITY_CATALOG;
  return CITY_CATALOG.filter(
    (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q),
  );
}
