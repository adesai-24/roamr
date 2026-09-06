import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Readiness probe: should this instance receive traffic? Checks that config is
 * present and that Supabase is reachable, so a pod with a broken environment is
 * pulled from the load balancer instead of serving errors.
 */
export async function GET() {
  const checks: Record<string, "ok" | "fail"> = {};

  let supabaseUrl: string | undefined;
  try {
    const { serverEnv } = await import("@/lib/env");
    supabaseUrl = serverEnv().NEXT_PUBLIC_SUPABASE_URL;
    checks.config = "ok";
  } catch {
    checks.config = "fail";
  }

  if (supabaseUrl) {
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, {
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
    {
      status: ready ? 200 : 503,
    },
  );
}
