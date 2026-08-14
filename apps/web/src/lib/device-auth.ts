import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type Device, devices } from "@/db/schema";
import { hashToken } from "@/lib/device-token";
import { budgetExhausted, clientIp, rateLimit, tooMany } from "@/lib/rate-limit";

/** Invalid-token answers allowed per minute, charged to a caller we can name.
 *  Only a miss spends it, so an honest device never draws it down. */
const BAD_TOKEN_LIMIT = 20;

/** Requests per minute allowed to callers presenting no token at all. Fixed,
 *  rather than the per-device `limit`, because it throttles anonymous spam and
 *  has nothing to do with how chatty one authorized device is allowed to be. */
const ANON_LIMIT = 60;

/** Device token from either header style the collectors use. */
function tokenFrom(req: Request): string | null {
  const k = req.headers.get("x-api-key");
  if (k) return k;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

/**
 * Resolves the device behind a request's token, or the response to send back
 * instead. `scope` keys the rate limiter, so a chatty reader cannot starve the
 * ingest path by sharing a counter with it; `limit` is requests per minute.
 */
export async function authenticateDevice(
  req: Request,
  scope: string,
  limit = 60,
): Promise<{ device: Device } | { response: Response }> {
  const ip = clientIp(req);
  const token = tokenFrom(req);
  if (!token) {
    const rl = rateLimit(`${scope}-ip:${ip}`, ANON_LIMIT, 60_000);
    if (!rl.ok) return { response: tooMany(rl.retryAfter) };
    return { response: Response.json({ error: "missing token" }, { status: 401 }) };
  }

  // The token is still unvalidated here, so it must not key the limiter: keying
  // on its hash hands an attacker a fresh bucket per forged token, which is both
  // an unthrottled guessing loop and one DB lookup per attempt. Charge misses to
  // the caller's IP instead — but only when the IP names one caller. Without a
  // trusted proxy clientIp is the constant "anon", i.e. one bucket for everyone,
  // and refusing on a shared bucket would let 20 forged tokens deny the entire
  // fleet. Set TRUST_PROXY (see .env.example) to make this gate effective.
  //
  // Ceiling: with TRUST_PROXY set the budget is per source IP, so devices behind
  // one NAT share it — a revoked device retrying in a loop can spend it, and the
  // gate below then answers 429 to its neighbours for the rest of the minute,
  // including ones holding valid tokens (it fires before the lookup, so it cannot
  // tell them apart). Per-token miss tracking would fix that; it is not worth the
  // extra keys until someone actually hits it.
  const missKey = ip === "anon" ? null : `${scope}-bad:${ip}`;
  if (missKey && budgetExhausted(missKey, BAD_TOKEN_LIMIT)) return { response: tooMany(60) };

  const tokenHash = hashToken(token);
  const device = (
    await db.select().from(devices).where(eq(devices.tokenHash, tokenHash)).limit(1)
  )[0];
  if (!device || device.revoked) {
    if (missKey) rateLimit(missKey, BAD_TOKEN_LIMIT, 60_000);
    return { response: Response.json({ error: "invalid token" }, { status: 401 }) };
  }

  // Per-device fairness limit, now that the key is known to be a real device.
  const rl = rateLimit(`${scope}:${tokenHash}`, limit, 60_000);
  if (!rl.ok) return { response: tooMany(rl.retryAfter) };
  return { device };
}
