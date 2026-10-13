import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness probe: is this process running and able to serve? */
export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "roamr-web",
    uptimeSeconds: Math.round(process.uptime()),
  });
}
