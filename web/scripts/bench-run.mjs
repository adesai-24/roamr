// node scripts/bench-run.mjs <cookieFile> [delays=0,100,300] [n=8]
// Requests each route against both builds (baseline :3101, branch :3102), interleaved, and reports
// median time plus how many Supabase calls the request caused.
//
// Recipe, with local Supabase up and API_URL, ANON_KEY, SERVICE_ROLE_KEY exported from
// `npx supabase status -o env`. Local only: every script refuses a non-local API_URL or is harmless.
//   node scripts/latency-proxy.mjs                    # :54399 -> :54321, adds a delay, counts calls
//   node scripts/bench-user.mjs cookie.txt            # test user + session cookie (expires in 1h)
//   node scripts/bench-seed.mjs                       # 24 moments so the feed is realistic
//   build each ref with NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399, then `next start`
//   the baseline on :3101 and the branch on :3102
//   node scripts/bench-run.mjs cookie.txt             # server time and Supabase calls per request
//   node scripts/bench-click.mjs cookie.txt           # real Edge: click to skeleton, click to content
//   node scripts/bench-trace.mjs cookie.txt 3102 /feed <userId>   # the call waterfall for one page
import { readFileSync } from "node:fs";
const raw = readFileSync(process.argv[2], "utf8");
const session = JSON.parse(
  Buffer.from(
    raw
      .split("=")
      .slice(1)
      .join("=")
      .replace(/^base64-/, ""),
    "base64url",
  ).toString(),
);
const cookie = `${raw}; roamr_onboarded=${session.user.id}`;
const delays = (process.argv[3] ?? "0,100,300").split(",").map(Number);
const N = Number(process.argv[4] ?? 8);
const builds = { baseline: 3101, branch: 3102 };
const routes = ["/feed", "/places", "/friends", "/trips", "/profile"];
const PROXY = "http://127.0.0.1:54399";
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

for (const delay of delays) {
  await fetch(`${PROXY}/__delay?ms=${delay}`);
  console.log(`\n=== +${delay}ms per Supabase call ===`);
  console.log(
    "route".padEnd(10),
    "baseline ms".padStart(12),
    "branch ms".padStart(10),
    "  calls: baseline -> branch",
  );
  for (const route of routes) {
    const res = {};
    for (const name of Object.keys(builds)) res[name] = { t: [], calls: 0, status: 0 };
    const go = (port) =>
      fetch(`http://localhost:${port}${route}`, { headers: { cookie }, redirect: "manual" });
    for (const port of Object.values(builds))
      for (let i = 0; i < 2; i++) await (await go(port)).text();
    for (let i = 0; i < N; i++) {
      for (const [name, port] of Object.entries(builds)) {
        await fetch(`${PROXY}/__counts`);
        const s = performance.now();
        const r = await go(port);
        await r.text();
        res[name].t.push(performance.now() - s);
        res[name].status = r.status;
        res[name].calls = Object.values(await (await fetch(`${PROXY}/__counts`)).json()).reduce(
          (a, b) => a + b,
          0,
        );
      }
    }
    const b = res.baseline,
      n = res.branch;
    const flag = (x) => (x.status === 200 ? "" : ` [${x.status}]`);
    console.log(
      route.padEnd(10),
      (med(b.t).toFixed(0) + flag(b)).padStart(12),
      (med(n.t).toFixed(0) + flag(n)).padStart(10),
      `  ${b.calls} -> ${n.calls}`,
    );
  }
}
