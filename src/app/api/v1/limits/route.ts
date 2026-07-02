import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { devices, userSettings } from "@/db/schema";
import { hashToken } from "@/lib/device-token";
import { bodyTooLarge, clientIp, rateLimit, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LimitsSchema = z.object({
  source: z.enum(["sub", "api"]),
  fiveHourPct: z.number().int().min(0).max(100).nullish(),
  sevenDayPct: z.number().int().min(0).max(100).nullish(),
  fiveHourResetsAt: z.string().nullish(),
  sevenDayResetsAt: z.string().nullish(),
  // Per-model limits from the dynamic rate-limit headers (e.g. Fable weekly).
  // Keys are constrained to header-safe charsets so junk can't land in jsonb.
  modelLimits: z
    .array(
      z.object({
        model: z.string().regex(/^[a-z0-9][a-z0-9_.-]{0,63}$/),
        window: z.string().regex(/^\d{1,3}[hdwm]$/),
        pct: z.number().int().min(0).max(100).nullish(),
        resetsAt: z.string().nullish(),
      }),
    )
    .max(16)
    .nullish(),
});

function tokenFrom(req: Request): string | null {
  const k = req.headers.get("x-api-key");
  if (k) return k;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: Request) {
  if (bodyTooLarge(req, 64 * 1024)) {
    return Response.json({ error: "payload too large" }, { status: 413 });
  }
  const token = tokenFrom(req);
  if (!token) {
    const rl = rateLimit(`limits-ip:${clientIp(req)}`, 60, 60_000);
    if (!rl.ok) return tooMany(rl.retryAfter);
    return Response.json({ error: "missing token" }, { status: 401 });
  }

  const tokenHash = hashToken(token);
  const rl = rateLimit(`limits:${tokenHash}`, 60, 60_000);
  if (!rl.ok) return tooMany(rl.retryAfter);

  const device = (
    await db.select().from(devices).where(eq(devices.tokenHash, tokenHash)).limit(1)
  )[0];
  if (!device || device.revoked) {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }

  const parsed = LimitsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }
  const b = parsed.data;
  const now = new Date();

  const set = {
    limitSource: b.source,
    fiveHourPct: b.fiveHourPct ?? null,
    sevenDayPct: b.sevenDayPct ?? null,
    fiveHourResetsAt: toDate(b.fiveHourResetsAt),
    sevenDayResetsAt: toDate(b.sevenDayResetsAt),
    limitsReportedAt: now,
    updatedAt: now,
    // Only overwrite the stored per-model limits when the collector sent a
    // non-empty set. The per-model caps come from a flaky best-effort OAuth
    // endpoint that returns [] on any timeout/hiccup; an empty array must not
    // wipe the last-known-good limits (that's what made the section flicker).
    // An older collector that omits the field entirely is preserved the same way.
    // Reset strings are normalized to ISO (unparseable → null) before storing.
    ...(b.modelLimits != null && b.modelLimits.length > 0 && {
      modelLimits: b.modelLimits.map((m) => ({
        model: m.model,
        window: m.window,
        pct: m.pct ?? null,
        resetsAt: toDate(m.resetsAt)?.toISOString() ?? null,
      })),
    }),
  };
  await db
    .insert(userSettings)
    .values({ userId: device.userId, ...set })
    .onConflictDoUpdate({ target: userSettings.userId, set });

  // Touch the device so the Devices list shows an accurate last-seen time.
  await db.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, device.id));

  return Response.json({ ok: true });
}
