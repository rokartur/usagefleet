import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { devices, groups, userSettings } from "@/db/schema";
import { getLiveDashboard, recordLimitSample } from "@/lib/data";
import { deviceWithinPlan, overPlanLimit } from "@/lib/billing";
import { authenticateDevice } from "@/lib/device-auth";
import { bodyTooLarge } from "@/lib/rate-limit";

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

function toDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The calling device's own group slice, for surfacing usage outside the
 * dashboard (status bars, editor plugins). Percentages are the group's budget
 * slice — the same numbers the dashboard's group table shows — because the
 * account-wide utilization a collector reads locally cannot be split per group
 * without every device's events.
 *
 * Also the enforcement read: `usagefleet guard` calls this on every prompt
 * and refuses the prompt when `blocked` is true.
 */
async function GET(req: Request) {
  const auth = await authenticateDevice(req, "limits-read");
  if ("response" in auth) return auth.response;
  const { device } = auth;

  // Owner-scoped so a stray cross-tenant groupId can never read another
  // account's switches.
  const [dash, group] = await Promise.all([
    getLiveDashboard(device.userId, new Date()),
    device.groupId
      ? db
          .select({
            blockOnSessionLimit: groups.blockOnSessionLimit,
            blockOnWeeklyLimit: groups.blockOnWeeklyLimit,
          })
          .from(groups)
          .where(and(eq(groups.id, device.groupId), eq(groups.ownerId, device.userId)))
          .limit(1)
          .then((r) => r[0])
      : undefined,
  ]);
  const usage = dash.groups.find((g) => g.groupId === device.groupId);
  const sessionPct = usage?.sessionBudgetPct ?? 0;
  const weeklyPct = usage?.weeklyBudgetPct ?? 0;

  // Per-group enforcement switches. Both windows are measured against the
  // group's equal budget slice, so 100% means "ate my share", not "the
  // account is out" — a group only blocks itself, never its siblings.
  const blockedWindow =
    group?.blockOnSessionLimit && sessionPct >= 100
      ? "session"
      : group?.blockOnWeeklyLimit && weeklyPct >= 100
        ? "weekly"
        : null;
  const resetsAt = blockedWindow === "session" ? dash.fiveHourResetsAt : dash.sevenDayResetsAt;

  return Response.json(
    {
      group: usage?.name ?? null,
      sessionPct,
      weeklyPct,
      blocked: blockedWindow !== null,
      blockedWindow,
      blockedUntil: blockedWindow ? (resetsAt?.toISOString() ?? null) : null,
      // Null until a collector reports real utilization; the percentages above
      // are meaningless (0) until then, and stale once this stops moving.
      reportedAt: dash.connected ? (dash.reportedAt?.toISOString() ?? null) : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

async function POST(req: Request) {
  if (bodyTooLarge(req, 64 * 1024)) {
    return Response.json({ error: "payload too large" }, { status: 413 });
  }
  const auth = await authenticateDevice(req, "limits");
  if ("response" in auth) return auth.response;
  const { device } = auth;
  if (!(await deviceWithinPlan(device))) return overPlanLimit();

  const parsed = LimitsSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "invalid payload", issues: parsed.error.issues },
      { status: 400 },
    );
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
    ...(b.modelLimits != null &&
      b.modelLimits.length > 0 && {
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

  await Promise.all([
    // Keep a per-window record of the reported utilization: Claude only reports
    // the open window, so this is the past-windows card's only ground truth
    // once a window closes.
    recordLimitSample(device.userId, "5h", b.fiveHourPct, set.fiveHourResetsAt),
    recordLimitSample(device.userId, "7d", b.sevenDayPct, set.sevenDayResetsAt),
    // Touch the device so the Devices list shows an accurate last-seen time.
    db.update(devices).set({ lastSeenAt: now }).where(eq(devices.id, device.id)),
  ]);

  return Response.json({ ok: true });
}

export const Route = createFileRoute("/api/v1/limits")({
  server: {
    handlers: {
      GET: ({ request }) => GET(request),
      POST: ({ request }) => POST(request),
    },
  },
});
