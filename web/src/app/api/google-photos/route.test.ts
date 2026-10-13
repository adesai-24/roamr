import { beforeEach, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const upstream = vi.fn();
const getUser = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", upstream);
  getUser.mockResolvedValue({ data: { user: { id: "u1" } } });
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser },
  } as unknown as Awaited<ReturnType<typeof createClient>>);
});

function call(body: unknown, init: { origin?: string | null; auth?: string | null } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  const origin = init.origin === undefined ? "http://localhost:3000" : init.origin;
  if (origin) headers.set("origin", origin);
  const auth = init.auth === undefined ? "Bearer token-123" : init.auth;
  if (auth) headers.set("authorization", auth);
  return POST(
    new Request("http://localhost:3000/api/google-photos", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

const listing = (baseUrl: string, type = "PHOTO") =>
  Response.json({ mediaItems: [{ id: "item1", type, mediaFile: { baseUrl } }] });
const download = { operation: "download", sessionId: "s1", itemId: "item1" };

it("rejects a foreign or missing origin before touching Google", async () => {
  expect((await call({ operation: "create" }, { origin: "https://evil.example" })).status).toBe(
    403,
  );
  expect((await call({ operation: "create" }, { origin: null })).status).toBe(403);
  expect(upstream).not.toHaveBeenCalled();
});

it("requires a signed-in user and a well-formed bearer token", async () => {
  getUser.mockResolvedValueOnce({ data: { user: null } });
  expect((await call({ operation: "create" })).status).toBe(401);
  expect((await call({ operation: "create" }, { auth: null })).status).toBe(401);
  expect((await call({ operation: "create" }, { auth: "Bearer a b" })).status).toBe(401);
  expect(upstream).not.toHaveBeenCalled();
});

it("rejects operations and fields outside the schema", async () => {
  expect((await call({ operation: "wipe" })).status).toBe(400);
  expect((await call({ operation: "poll" })).status).toBe(400);
  expect(upstream).not.toHaveBeenCalled();
});

it("forwards a valid operation to the Picker API with the caller's token", async () => {
  upstream.mockResolvedValueOnce(Response.json({ id: "s1" }));
  const res = await call({ operation: "poll", sessionId: "s1" });
  expect(res.status).toBe(200);
  expect(upstream.mock.calls[0]![0]).toBe("https://photospicker.googleapis.com/v1/sessions/s1");
  expect(upstream.mock.calls[0]![1].headers.Authorization).toBe("Bearer token-123");
});

it("refuses to fetch a photo from a host outside googleusercontent.com", async () => {
  for (const baseUrl of [
    "https://evil.example/p",
    "https://googleusercontent.com.evil.example/p",
    "http://lh3.googleusercontent.com/p",
    "https://lh3.googleusercontent.com:8443/p",
    "https://user:pw@lh3.googleusercontent.com/p",
  ]) {
    upstream.mockReset();
    upstream.mockResolvedValueOnce(listing(baseUrl));
    expect((await call(download)).status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(1);
  }
});

it("refuses videos", async () => {
  upstream.mockResolvedValueOnce(listing("https://lh3.googleusercontent.com/p", "VIDEO"));
  expect((await call(download)).status).toBe(400);
});

it("streams an allowed photo back and never follows redirects", async () => {
  upstream
    .mockResolvedValueOnce(listing("https://lh3.googleusercontent.com/p"))
    .mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }),
    );
  const res = await call(download);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toBe("image/jpeg");
  expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  expect(upstream.mock.calls[1]![0]).toBe("https://lh3.googleusercontent.com/p=w2048-h2048");
  expect(upstream.mock.calls[1]![1].redirect).toBe("error");
});

it("rejects a non-image response and an oversized photo", async () => {
  upstream
    .mockResolvedValueOnce(listing("https://lh3.googleusercontent.com/p"))
    .mockResolvedValueOnce(new Response("<html>", { headers: { "content-type": "text/html" } }));
  expect((await call(download)).status).toBe(502);

  const chunk = new Uint8Array(11 * 1024 * 1024);
  const big = new ReadableStream({
    start(controller) {
      controller.enqueue(chunk);
      controller.enqueue(chunk);
      controller.close();
    },
  });
  upstream
    .mockResolvedValueOnce(listing("https://lh3.googleusercontent.com/p"))
    .mockResolvedValueOnce(new Response(big, { headers: { "content-type": "image/jpeg" } }));
  expect((await call(download)).status).toBe(413);
});
