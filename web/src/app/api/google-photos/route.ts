import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const sessionId = z.string().min(1).max(512);
const inputSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("create") }),
  z.object({ operation: z.literal("poll"), sessionId }),
  z.object({ operation: z.literal("delete"), sessionId }),
  z.object({ operation: z.literal("list"), sessionId, pageToken: z.string().max(4096).optional() }),
  z.object({
    operation: z.literal("download"),
    sessionId,
    itemId: z.string().min(1).max(512),
    pageToken: z.string().max(4096).optional(),
  }),
]);

const headers = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

/** OAuth API bridge; credentials and photo URLs never enter persistent storage. */
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return json({ error: "Invalid request origin." }, 403);
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Sign in to import photos." }, 401);
  const authorization = request.headers.get("authorization");
  if (
    !authorization ||
    !/^Bearer [A-Za-z0-9._~+\/-]+=*$/.test(authorization) ||
    authorization.length > 8192
  ) {
    return json({ error: "Connect Google Photos again." }, 401);
  }
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid photo request." }, 400);
  const input = parsed.data;

  try {
    const listing = input.operation === "list" || input.operation === "download";
    const path =
      input.operation === "create"
        ? "sessions"
        : listing
          ? `mediaItems?${new URLSearchParams({ sessionId: input.sessionId, pageSize: "100", ...(input.pageToken ? { pageToken: input.pageToken } : {}) })}`
          : `sessions/${encodeURIComponent(input.sessionId)}`;
    const response = await fetch(`https://photospicker.googleapis.com/v1/${path}`, {
      method:
        input.operation === "create" ? "POST" : input.operation === "delete" ? "DELETE" : "GET",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      ...(input.operation === "create"
        ? { body: JSON.stringify({ pickingConfig: { maxItemCount: "20" } }) }
        : {}),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const error =
        response.status === 401 || response.status === 403
          ? "Google Photos access was denied or expired. Connect again and allow photo access."
          : response.status === 429
            ? "Google Photos is busy. Wait a moment and try again."
            : "That Google Photos session is unavailable. Please start again.";
      return json({ error }, response.status === 429 ? 429 : 502);
    }
    if (input.operation === "delete") return json({});
    const data = await response.json();
    if (input.operation !== "download") return json(data);

    // Resolve bytes from Google's session, never from a caller-supplied URL.
    const item = data.mediaItems?.find((entry: { id: string }) => entry.id === input.itemId);
    if (item?.type !== "PHOTO") return json({ error: "Choose a photo, rather than a video." }, 400);
    const url = new URL(item.mediaFile.baseUrl);
    if (
      url.protocol !== "https:" ||
      !url.hostname.endsWith(".googleusercontent.com") ||
      url.port ||
      url.username ||
      url.password
    ) {
      return json({ error: "Google returned an unsupported photo address." }, 502);
    }
    // Matches the existing upload size; Google omits GPS metadata.
    const photo = await fetch(`${url.href}=w2048-h2048`, {
      headers: { Authorization: authorization },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!photo.ok || !photo.headers.get("content-type")?.startsWith("image/") || !photo.body) {
      return json({ error: "Could not download that photo. Please select it again." }, 502);
    }
    const reader = photo.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 20 * 1024 * 1024) {
        await reader.cancel();
        return json({ error: "That photo is too large to import." }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new Response(bytes, {
      headers: {
        ...headers,
        "Content-Type": photo.headers.get("content-type")!,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return json({ error: "Could not reach Google Photos. Please try again." }, 502);
  }
}
