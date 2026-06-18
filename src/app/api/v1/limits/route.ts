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

  await db
    .insert(userSettings)
    .values({
      userId: device.userId,
      limitSource: b.source,
      fiveHourPct: b.fiveHourPct ?? null,
      sevenDayPct: b.sevenDayPct ?? null,
      fiveHourResetsAt: toDate(b.fiveHourResetsAt),
      sevenDayResetsAt: toDate(b.sevenDayResetsAt),
      limitsReportedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: {
        limitSource: b.source,
        fiveHourPct: b.fiveHourPct ?? null,
        sevenDayPct: b.sevenDayPct ?? null,
        fiveHourResetsAt: toDate(b.fiveHourResetsAt),
        sevenDayResetsAt: toDate(b.sevenDayResetsAt),
        limitsReportedAt: now,
        updatedAt: now,
      },
    });

  // Touch the device so the Devices list shows an accurate last-seen time.
  await db.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, device.id));

  return Response.json({ ok: true });
}
