// node scripts/bench-click.mjs <cookieFile> [delays=0,100,300] [rounds=3]
// Real-browser click test (Edge): load /feed, wait for prefetch, click each nav tab, time
// "click -> first paint of the next page (skeleton or content)" and "click -> real content".
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";

const raw = readFileSync(process.argv[2], "utf8");
const [name, ...rest] = raw.split("=");
const value = rest.join("=");
const session = JSON.parse(Buffer.from(value.replace(/^base64-/, ""), "base64url").toString());
const delays = (process.argv[3] ?? "0,100,300").split(",").map(Number);
const ROUNDS = Number(process.argv[4] ?? 3);
const builds = { baseline: 3101, branch: 3102 };
const tabs = ["Profile", "Trips", "Friends", "Places", "Feed"];
const heading = {
  Profile: "Bench",
  Trips: "Trips",
  Friends: "Friends",
  Places: "Places",
  Feed: "Feed",
};
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const delay of delays) {
  await fetch(`http://127.0.0.1:54399/__delay?ms=${delay}`);
  console.log(`\n=== +${delay}ms per Supabase call (client-side clicks) ===`);
  console.log(
    "build".padEnd(10),
    "tab".padEnd(9),
    "first paint ms".padStart(15),
    "content ms".padStart(11),
  );
  for (const [build, port] of Object.entries(builds)) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    await ctx.addCookies([
      { name, value, url: `http://localhost:${port}` },
      { name: "roamr_onboarded", value: session.user.id, url: `http://localhost:${port}` },
    ]);
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/feed`, { waitUntil: "load" });
    const paint = {},
      content = {};
    for (let round = 0; round < ROUNDS; round++) {
      for (const tab of tabs) {
        await page.waitForTimeout(1500); // let link prefetch settle, like a person reading the page
        const link = page.locator("header nav a", { hasText: new RegExp(`^${tab}$`) }).first();
        const t0 = Date.now();
        await link.click();
        const path = "/" + tab.toLowerCase();
        await page.waitForURL((u) => u.pathname === path, { timeout: 60000 });
        const tPaint = Date.now() - t0;
        await page.locator("main h1, main [aria-busy=true]").first().waitFor({ timeout: 60000 });
        await page
          .locator("main h1", { hasText: heading[tab] })
          .first()
          .waitFor({ timeout: 60000 });
        const tContent = Date.now() - t0;
        (paint[tab] ??= []).push(tPaint);
        (content[tab] ??= []).push(tContent);
      }
    }
    for (const tab of tabs)
      console.log(
        build.padEnd(10),
        tab.padEnd(9),
        String(med(paint[tab])).padStart(15),
        String(med(content[tab])).padStart(11),
      );
    await ctx.close();
  }
}
await browser.close();
