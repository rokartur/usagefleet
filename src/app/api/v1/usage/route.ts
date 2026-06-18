import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { devices, usageEvents } from "@/db/schema";
import { hashToken } from "@/lib/device-token";
import { bodyTooLarge, clientIp, rateLimit, tooMany } from "@/lib/rate-limit";

const MAX_BODY = 8 * 1024 * 1024; // 8 MB (1000 records * generous per-record)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RecordSchema = z.object({
  uuid: z.string().min(1),
  messageId: z.string().nullish(),
  requestId: z.string().nullish(),
  model: z.string().nullish(),
  sessionId: z.string().nullish(),
  timestamp: z
    .string()
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "invalid timestamp"),
  cwd: z.string().nullish(),
  gitBranch: z.string().nullish(),
  version: z.string().nullish(),
  inputTokens: z.number().int().nonnegative().default(0),
  outputTokens: z.number().int().nonnegative().default(0),
  cacheCreationTokens: z.number().int().nonnegative().default(0),
  cacheReadTokens: z.number().int().nonnegative().default(0),
  serviceTier: z.string().nullish(),
});

const BatchSchema = z.object({
  os: z.enum(["mac", "linux", "windows"]).optional(),
  hostname: z.string().optional(),
  collectorVersion: z.string().optional(),
  records: z.array(RecordSchema).max(1000),
});

function bearerOrApiKey(req: Request): string | null {
  const k = req.headers.get("x-api-key");
  if (k) return k;
  const auth = req.headers.get("authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

export async function POST(req: Request) {
  if (bodyTooLarge(req, MAX_BODY)) {
    return Response.json({ error: "payload too large" }, { status: 413 });
  }
  const token = bearerOrApiKey(req);
  if (!token) {
    // throttle pre-auth traffic by IP
    const rl = rateLimit(`ingest-ip:${clientIp(req)}`, 60, 60_000);
    if (!rl.ok) return tooMany(rl.retryAfter);
    return Response.json({ error: "missing token" }, { status: 401 });
  }

  const tokenHash = hashToken(token);
  const rl = rateLimit(`ingest:${tokenHash}`, 240, 60_000); // 240 req/min/device
  if (!rl.ok) return tooMany(rl.retryAfter);

  const device = (
    await db.select().from(devices).where(eq(devices.tokenHash, tokenHash)).limit(1)
  )[0];
  if (!device || device.revoked) {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }

  const parsed = BatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const batch = parsed.data;

  let accepted = 0;
  if (batch.records.length > 0) {
    const rows = batch.records.map((r) => ({
      id: randomUUID(),
      userId: device.userId,
      deviceId: device.id,
      uuid: r.uuid,
      messageId: r.messageId ?? null,
      requestId: r.requestId ?? null,
      model: r.model ?? null,
      sessionId: r.sessionId ?? null,
      ts: new Date(r.timestamp),
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cacheCreationTokens: r.cacheCreationTokens,
      cacheReadTokens: r.cacheReadTokens,
      serviceTier: r.serviceTier ?? null,
      cwd: r.cwd ?? null,
      gitBranch: r.gitBranch ?? null,
      claudeVersion: r.version ?? null,
    }));
    const inserted = await db
      .insert(usageEvents)
      .values(rows)
      .onConflictDoNothing({ target: [usageEvents.userId, usageEvents.uuid] })
      .returning({ id: usageEvents.id });
    accepted = inserted.length;
  }

  await db
    .update(devices)
    .set({
      lastSeenAt: new Date(),
      os: batch.os ?? device.os,
      hostname: batch.hostname ?? device.hostname,
      collectorVersion: batch.collectorVersion ?? device.collectorVersion,
    })
    .where(eq(devices.id, device.id));

  return Response.json({
    accepted,
    duplicates: batch.records.length - accepted,
  });
}
