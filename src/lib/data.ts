import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { devices, groups, usageEvents, userSettings } from "@/db/schema";
import {
  billableTokens,
  computeDashboardUsage,
  type DashboardUsage,
  foldAndSum,
  type UsageRecord,
} from "@/lib/usage";

/** Lazily create and return the user's settings row (defaults = max5 preset). */
export async function ensureSettings(userId: string) {
  const existing = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  return (
    inserted[0] ??
    (await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1))[0]
  );
}

/** Events for a user at or after `cutoff`, joined to their device's group. */
export async function loadRecentEvents(
  userId: string,
  cutoff: Date,
): Promise<UsageRecord[]> {
  const rows = await db
    .select({
      uuid: usageEvents.uuid,
      messageId: usageEvents.messageId,
      requestId: usageEvents.requestId,
      model: usageEvents.model,
      ts: usageEvents.ts,
      inputTokens: usageEvents.inputTokens,
      outputTokens: usageEvents.outputTokens,
      cacheCreationTokens: usageEvents.cacheCreationTokens,
      cacheReadTokens: usageEvents.cacheReadTokens,
      deviceId: usageEvents.deviceId,
      groupId: devices.groupId,
    })
    .from(usageEvents)
    .innerJoin(devices, eq(usageEvents.deviceId, devices.id))
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.ts, cutoff)));
  return rows.map((r) => ({ ...r, ts: new Date(r.ts) }));
}

export async function getDashboard(
  userId: string,
  now: Date,
): Promise<DashboardUsage> {
  const cutoff = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const [settings, groupRows, events] = await Promise.all([
    ensureSettings(userId),
    db.select().from(groups).where(eq(groups.ownerId, userId)),
    loadRecentEvents(userId, cutoff),
  ]);
  return computeDashboardUsage(
    events,
    groupRows.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    {
      sessionLimitTokens: settings.sessionLimitTokens,
      weeklyLimitTokens: settings.weeklyLimitTokens,
      weekResetWeekday: settings.weekResetWeekday,
      weekResetHourUtc: settings.weekResetHourUtc,
    },
    now,
  );
}

export interface LiveGroupUsage {
  groupId: string | null;
  name: string;
  color: string;
  sessionPct: number;
  weeklyPct: number;
  sessionTokens: number;
  weeklyTokens: number;
}

export interface LiveDashboard {
  /** True once the collector has reported real utilization at least once. */
  connected: boolean;
  source: "sub" | "api" | null;
  reportedAt: Date | null;
  fiveHourPct: number;
  sevenDayPct: number;
  fiveHourResetsAt: Date | null;
  sevenDayResetsAt: Date | null;
  groups: LiveGroupUsage[];
}

const FIVE_H_MS = 5 * 60 * 60 * 1000;
const SEVEN_D_MS = 7 * 24 * 60 * 60 * 1000;

/** Split an official account-wide percentage across groups by each group's
 *  share of local billable tokens within the same window. */
function splitByShare(
  events: UsageRecord[],
  windowStart: Date,
  now: Date,
  officialPct: number,
): Map<string | null, { pct: number; tokens: number }> {
  const inWin = events.filter((e) => {
    const t = e.ts.getTime();
    return t >= windowStart.getTime() && t <= now.getTime();
  });
  const byGroup = new Map<string | null, UsageRecord[]>();
  for (const e of inWin) {
    const g = e.groupId ?? null;
    const arr = byGroup.get(g);
    if (arr) arr.push(e);
    else byGroup.set(g, [e]);
  }
  const tokensByGroup = new Map<string | null, number>();
  let total = 0;
  for (const [g, evs] of byGroup) {
    const tok = billableTokens(foldAndSum(evs));
    tokensByGroup.set(g, tok);
    total += tok;
  }
  const out = new Map<string | null, { pct: number; tokens: number }>();

  // Largest-remainder (Hamilton) apportionment so per-group pcts sum EXACTLY to
  // the integer official pct (avoids the rounding drift of independent rounds).
  const target = Math.max(0, Math.round(officialPct));
  if (total <= 0 || target === 0) {
    for (const [g, tok] of tokensByGroup) out.set(g, { tokens: tok, pct: 0 });
    return out;
  }
  const rows = [...tokensByGroup].map(([g, tok]) => {
    const exact = target * (tok / total);
    const floor = Math.floor(exact);
    return { g, tok, floor, frac: exact - floor };
  });
  let leftover = target - rows.reduce((s, r) => s + r.floor, 0);
  rows.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < rows.length && leftover > 0; i++, leftover--) {
    rows[i].floor += 1;
  }
  for (const r of rows) out.set(r.g, { tokens: r.tok, pct: r.floor });
  return out;
}

/**
 * Real per-account utilization as last reported by the collector (which reads
 * it from the local Claude Code login), with a local token-share split per
 * group. `connected: false` until the collector has reported once.
 */
export async function getLiveDashboard(
  userId: string,
  now: Date,
): Promise<LiveDashboard> {
  const settings = await ensureSettings(userId);
  const hasLimits =
    settings.fiveHourPct !== null || settings.sevenDayPct !== null;

  const clampPct = (v: number | null) => Math.min(100, Math.max(0, v ?? 0));
  const base = {
    source: (settings.limitSource as "sub" | "api" | null) ?? null,
    reportedAt: settings.limitsReportedAt ? new Date(settings.limitsReportedAt) : null,
    fiveHourPct: clampPct(settings.fiveHourPct),
    sevenDayPct: clampPct(settings.sevenDayPct),
    fiveHourResetsAt: settings.fiveHourResetsAt ? new Date(settings.fiveHourResetsAt) : null,
    sevenDayResetsAt: settings.sevenDayResetsAt ? new Date(settings.sevenDayResetsAt) : null,
  };

  if (!hasLimits) {
    return { connected: false, groups: [], ...base };
  }

  // Clamp each window to exactly its nominal duration ending at `now`, so a
  // stale resets_at can never widen the split window beyond 5h / 7d.
  const fiveStart = new Date(
    Math.max(
      (base.fiveHourResetsAt ?? new Date(now.getTime() - FIVE_H_MS)).getTime() - FIVE_H_MS,
      now.getTime() - FIVE_H_MS,
    ),
  );
  const weekStart = new Date(
    Math.max(
      (base.sevenDayResetsAt ?? new Date(now.getTime() - SEVEN_D_MS)).getTime() - SEVEN_D_MS,
      now.getTime() - SEVEN_D_MS,
    ),
  );

  // Load only what the windows need (covers a future reset too), not a fixed 8d.
  const earliest = new Date(
    Math.min(weekStart.getTime(), fiveStart.getTime()) - 5 * 60 * 1000,
  );
  // Events and the group list are independent — fetch them in one round-trip.
  const [events, groupRows] = await Promise.all([
    loadRecentEvents(userId, earliest),
    db.select().from(groups).where(eq(groups.ownerId, userId)),
  ]);

  const sessionSplit = splitByShare(events, fiveStart, now, base.fiveHourPct);
  const weeklySplit = splitByShare(events, weekStart, now, base.sevenDayPct);

  const keys = new Set<string | null>([
    ...sessionSplit.keys(),
    ...weeklySplit.keys(),
  ]);
  const nameFor = (id: string | null) =>
    id === null ? "Ungrouped" : (groupRows.find((g) => g.id === id)?.name ?? "Unknown");
  const colorFor = (id: string | null) =>
    id === null ? "#94a3b8" : (groupRows.find((g) => g.id === id)?.color ?? "#94a3b8");

  const groupUsages: LiveGroupUsage[] = [...keys].map((id) => ({
    groupId: id,
    name: nameFor(id),
    color: colorFor(id),
    sessionPct: sessionSplit.get(id)?.pct ?? 0,
    weeklyPct: weeklySplit.get(id)?.pct ?? 0,
    sessionTokens: sessionSplit.get(id)?.tokens ?? 0,
    weeklyTokens: weeklySplit.get(id)?.tokens ?? 0,
  }));
  groupUsages.sort((a, b) => b.weeklyTokens - a.weeklyTokens);

  return { connected: true, groups: groupUsages, ...base };
}

/** JSON-serializable form of LiveDashboard (Dates → ISO) for the client poll. */
export interface DashboardDTO {
  connected: boolean;
  source: "sub" | "api" | null;
  reportedAt: string | null;
  fiveHourPct: number;
  sevenDayPct: number;
  fiveHourResetsAt: string | null;
  sevenDayResetsAt: string | null;
  groups: LiveGroupUsage[];
}

export function toDashboardDTO(d: LiveDashboard): DashboardDTO {
  return {
    connected: d.connected,
    source: d.source,
    reportedAt: d.reportedAt?.toISOString() ?? null,
    fiveHourPct: d.fiveHourPct,
    sevenDayPct: d.sevenDayPct,
    fiveHourResetsAt: d.fiveHourResetsAt?.toISOString() ?? null,
    sevenDayResetsAt: d.sevenDayResetsAt?.toISOString() ?? null,
    groups: d.groups,
  };
}

export async function listGroups(userId: string) {
  const counts = await db
    .select({
      groupId: devices.groupId,
      count: sql<number>`count(*)::int`,
    })
    .from(devices)
    .where(eq(devices.userId, userId))
    .groupBy(devices.groupId);
  const countMap = new Map(counts.map((c) => [c.groupId, c.count]));
  const rows = await db
    .select()
    .from(groups)
    .where(eq(groups.ownerId, userId))
    .orderBy(desc(groups.createdAt));
  return rows.map((g) => ({ ...g, deviceCount: countMap.get(g.id) ?? 0 }));
}

export async function listDevices(userId: string) {
  return db
    .select({
      id: devices.id,
      name: devices.name,
      os: devices.os,
      hostname: devices.hostname,
      groupId: devices.groupId,
      groupName: groups.name,
      revoked: devices.revoked,
      tokenPrefix: devices.tokenPrefix,
      collectorVersion: devices.collectorVersion,
      lastSeenAt: devices.lastSeenAt,
      createdAt: devices.createdAt,
    })
    .from(devices)
    // Owner-scoped join so a stray cross-tenant groupId can never leak a name.
    .leftJoin(
      groups,
      and(eq(devices.groupId, groups.id), eq(groups.ownerId, userId)),
    )
    .where(eq(devices.userId, userId))
    .orderBy(desc(devices.createdAt));
}
