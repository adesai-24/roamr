// node scripts/bench-trace.mjs <cookieFile> <port> <route>: one warm request, then the Supabase call timeline it caused.
import { readFileSync } from "node:fs";
const cookie = readFileSync(process.argv[2], "utf8") + "; roamr_onboarded=" + process.argv[5];
const [, , , port, route] = process.argv;
const go = () =>
  fetch(`http://localhost:${port}${route}`, { headers: { cookie }, redirect: "manual" });
for (let i = 0; i < 2; i++) await (await go()).text();
await fetch("http://127.0.0.1:54399/__timeline");
const s = performance.now();
const r = await go();
await r.text();
const total = performance.now() - s;
const tl = await (await fetch("http://127.0.0.1:54399/__timeline")).json();
console.log(`${route} on :${port} total ${total.toFixed(0)}ms (status ${r.status})`);
for (const x of tl.sort((a, b) => a.at - b.at))
  console.log(
    `  +${String(x.at - Math.round(s)).padStart(4)}ms  ${String(x.took).padStart(4)}ms  ${x.key}`,
  );
