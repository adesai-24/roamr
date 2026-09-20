// Sits in front of local Supabase, adds a fixed delay per request (simulated RTT), counts and times calls.
// Control: GET /__delay?ms=N   GET /__counts (returns and resets)   GET /__timeline (returns and resets)
import http from "node:http";
const [, , listen = "54399", target = "54321"] = process.argv;
let delay = 0;
let counts = {};
let timeline = [];
const label = (u) =>
  u
    .split("?")[0]
    .replace(/\/(v1|v2)\//, "/")
    .split("/")
    .slice(0, 4)
    .join("/");
const json = (res, v) => {
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(v));
};

http
  .createServer((req, res) => {
    if (req.url.startsWith("/__delay")) {
      delay = Number(new URL(req.url, "http://x").searchParams.get("ms"));
      return res.end("ok");
    }
    if (req.url.startsWith("/__counts")) {
      const c = counts;
      counts = {};
      return json(res, c);
    }
    if (req.url.startsWith("/__timeline")) {
      const t = timeline;
      timeline = [];
      return json(res, t);
    }
    const key = `${req.method} ${label(req.url)}`;
    counts[key] = (counts[key] ?? 0) + 1;
    const start = performance.now();
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () =>
      setTimeout(() => {
        const up = http.request(
          {
            host: "127.0.0.1",
            port: target,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (r) => {
            res.writeHead(r.statusCode, r.headers);
            r.pipe(res);
            r.on("end", () =>
              timeline.push({
                at: Math.round(start),
                took: Math.round(performance.now() - start),
                key,
              }),
            );
          },
        );
        up.on("error", () => {
          res.statusCode = 502;
          res.end();
        });
        up.end(Buffer.concat(chunks));
      }, delay),
    );
  })
  .listen(Number(listen), () => console.log("proxy", listen, "->", target));
