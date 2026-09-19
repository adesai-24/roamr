import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, "", "test-mapbox-token"])(
  "accepts an optional Mapbox token: %s",
  async (token) => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", token);
    const { serverEnv } = await import("./env");
    expect(serverEnv().MAPBOX_ACCESS_TOKEN).toBe(token);
  },
);
