import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Readiness probe: should this instance receive traffic? */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};

  let supabaseUrl: string | undefined;
  let anonKey: string | undefined;
  try {
    const { serverEnv } = await import("@/lib/env");
    const env = serverEnv();
    supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
    anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    checks.config = "ok";
  } catch {
    checks.config = "fail";
  }

  if (supabaseUrl && anonKey) {
    try {
      // The apikey header is required.
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
        headers: { apikey: anonKey },
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      checks.supabase = res.ok ? "ok" : "fail";
    } catch {
      checks.supabase = "fail";
    }
  }

  const ready = Object.values(checks).every((v) => v === "ok");
  return NextResponse.json(
    { status: ready ? "ready" : "not_ready", checks },
    { status: ready ? 200 : 503 },
  );
}
