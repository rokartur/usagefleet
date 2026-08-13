import { eq } from "drizzle-orm";
import { db } from "@/db";
import { type Device, devices } from "@/db/schema";
import { hashToken } from "@/lib/device-token";
import { clientIp, rateLimit, tooMany } from "@/lib/rate-limit";

/** Device token from either header style the collectors use. */
export function tokenFrom(req: Request): string | null {
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
  const token = tokenFrom(req);
  if (!token) {
    const rl = rateLimit(`${scope}-ip:${clientIp(req)}`, limit, 60_000);
    if (!rl.ok) return { response: tooMany(rl.retryAfter) };
    return { response: Response.json({ error: "missing token" }, { status: 401 }) };
  }

  const tokenHash = hashToken(token);
  const rl = rateLimit(`${scope}:${tokenHash}`, limit, 60_000);
  if (!rl.ok) return { response: tooMany(rl.retryAfter) };

  const device = (
    await db.select().from(devices).where(eq(devices.tokenHash, tokenHash)).limit(1)
  )[0];
  if (!device || device.revoked) {
    return { response: Response.json({ error: "invalid token" }, { status: 401 }) };
  }
  return { device };
}
