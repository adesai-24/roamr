const hits = new Map<string, number[]>();

/**
 * True when `key` has already used `limit` calls inside the last `windowMs`; otherwise records one.
 * ponytail: per-process memory, so N replicas allow N times the limit. Move to a shared store if
 * that ceiling matters.
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  const limited = recent.length >= limit;
  if (!limited) recent.push(now);
  hits.set(key, recent);

  // Keys are user ids, so without a sweep the map only ever grows.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (now - (v[v.length - 1] ?? 0) >= windowMs) hits.delete(k);
  }
  return limited;
}
