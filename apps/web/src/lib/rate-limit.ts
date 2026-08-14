// Lightweight in-memory fixed-window rate limiter. Adequate for a self-hosted
// single-instance deployment; swap for a shared store if you scale horizontally.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateResult {
  ok: boolean;
  /** Seconds until the window resets (for Retry-After). */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();

  // Opportunistic prune so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }

  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Rate-limit key derived from the client IP.
 *
 * `X-Forwarded-For` is client-controlled, so trusting its leftmost value lets an
 * attacker mint a fresh bucket per request and defeat the pre-auth throttle. We
 * only parse it when `TRUST_PROXY` is set (the operator runs a reverse proxy
 * that appends a trustworthy entry), and then read from the RIGHT — the entries
 * your own infrastructure appended — skipping `hops` proxies. Leftmost (forged)
 * entries are ignored.
 *
 * Default (no trusted proxy, e.g. the direct-exposed compose port): ignore all
 * client-supplied headers and use a single shared bucket. Strict but unspoofable
 * — device ingestion is keyed on the token hash, not the IP, so this mostly
 * throttles anonymous spam.
 *
 * The exception is the public installer download (/api/v1/collector/asset),
 * which is anonymous by design: on the shared bucket its limit applies to every
 * caller at once, so a public deployment MUST set TRUST_PROXY or the
 * `curl | sh` install will throttle strangers against each other.
 */
export function clientIp(req: Request): string {
  const trust = process.env.TRUST_PROXY;
  if (!trust || trust === "false" || trust === "0") return "anon";

  const hops =
    trust === "true"
      ? 1
      : Number.isFinite(Number(trust)) && Number(trust) > 0
        ? Math.floor(Number(trust))
        : 1;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const idx = parts.length - hops;
    if (idx >= 0 && parts[idx]) return parts[idx]!;
    if (parts.length > 0) return parts[0]!;
  }
  return req.headers.get("x-real-ip") ?? "anon";
}

export function tooMany(retryAfter: number): Response {
  return Response.json(
    { error: "rate limited" },
    { status: 429, headers: { "retry-after": String(retryAfter) } },
  );
}

/** Reject obviously-oversized bodies before parsing (defense vs huge payloads). */
export function bodyTooLarge(req: Request, maxBytes: number): boolean {
  const len = Number(req.headers.get("content-length") ?? 0);
  return Number.isFinite(len) && len > maxBytes;
}
