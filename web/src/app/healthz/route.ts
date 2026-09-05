import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe: is this process running and able to serve? Deliberately has
 * no dependencies -- a liveness check that touches the database restarts a
 * healthy pod whenever Postgres hiccups, which is the opposite of what it is
 * for. Readiness (/readyz) is where dependencies belong.
 */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "roamr-web",
    uptimeSeconds: Math.round(process.uptime()),
  });
}
