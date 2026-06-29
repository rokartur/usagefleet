import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { devices, groups, usageEvents, userSettings } from "@/db/schema";
import {
  aggToDailyBuckets,
  aggToMonthlyBuckets,
  billableTokens,
  buildTimelineFromFolded,
  computeDashboardUsage,
  type DailyAggRow,
  dailyLedger,
  type DashboardUsage,
  dayKey,
  EMPTY_TOTALS,
  filterByWindow,
  foldAndSum,
  foldEvents,
  groupTotals,
  modelBreakdown,
  type ModelUsage,
  monthKey,
  monthlyLedger,
  sumAgg,
  sumRecords,
  type TimelineBucket,
  type TokenTotals,
  totalsForDay,
  totalsForMonth,
  type UsagePeriod,
  type UsageRecord,
} from "@/lib/usage";

const DAY_MS = 24 * 60 * 60 * 1000;

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
      source: usageEvents.source,
    })
    .from(usageEvents)
    .innerJoin(devices, eq(usageEvents.deviceId, devices.id))
    .where(and(eq(usageEvents.userId, userId), gte(usageEvents.ts, cutoff)));
  return rows.map((r) => ({ ...r, ts: new Date(r.ts) }));
}

/**
 * Folded, per-(UTC day × group × model) token aggregates over the user's ENTIRE
 * history — the cheap foundation for the day / month / all-time usage figures.
 *
 * Folding (collapse streamed segments to the largest per logical message — see
 * fold.ts) is done IN SQL via DISTINCT ON so the whole table never has to be
 * pulled into Node: the result is one small row per active (day, group, model)
 * cell. Rows with no real tokens (e.g. "<synthetic>" placeholders) are dropped
 * by the HAVING clause. Days are bucketed in UTC to match the JS timelines.
 */
export async function loadDailyAggregates(
  userId: string,
): Promise<DailyAggRow[]> {
  // The logical-message fold key: (messageId, requestId) when present, else the
  // row's own uuid. Prefixed so a uuid can never collide with a messageId pair.
  const foldKey = sql`CASE WHEN ${usageEvents.messageId} IS NOT NULL THEN 'm:' || ${usageEvents.messageId} || '::' || coalesce(${usageEvents.requestId}, '') ELSE 'u:' || ${usageEvents.uuid} END`;
  const rowTotal = sql`(${usageEvents.inputTokens} + ${usageEvents.outputTokens} + ${usageEvents.cacheCreationTokens} + ${usageEvents.cacheReadTokens})`;

  const result = await db.execute(sql`
    WITH folded AS (
      SELECT DISTINCT ON (${foldKey})
        ${usageEvents.ts} AS ts,
        ${usageEvents.deviceId} AS device_id,
        ${usageEvents.model} AS model,
        ${usageEvents.source} AS source,
        ${usageEvents.inputTokens} AS input_tokens,
        ${usageEvents.outputTokens} AS output_tokens,
        ${usageEvents.cacheCreationTokens} AS cache_creation_tokens,
        ${usageEvents.cacheReadTokens} AS cache_read_tokens
      FROM ${usageEvents}
      WHERE ${usageEvents.userId} = ${userId}
      ORDER BY ${foldKey}, ${rowTotal} DESC, ${usageEvents.ts} ASC
    )
    SELECT
      to_char(date_trunc('day', folded.ts AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS day,
      d.group_id AS group_id,
      folded.model AS model,
      folded.source AS source,
      folded.device_id AS device_id,
      sum(folded.input_tokens)::bigint AS input,
      sum(folded.output_tokens)::bigint AS output,
      sum(folded.cache_creation_tokens)::bigint AS cache_creation,
      sum(folded.cache_read_tokens)::bigint AS cache_read
    FROM folded
    JOIN ${devices} d ON d.id = folded.device_id
    GROUP BY 1, 2, 3, 4, 5
    HAVING (
      sum(folded.input_tokens) + sum(folded.output_tokens) +
      sum(folded.cache_creation_tokens) + sum(folded.cache_read_tokens)
    ) > 0
  `);

  const rows = result as unknown as Array<{
    day: string;
    group_id: string | null;
    model: string | null;
    source: string | null;
    device_id: string | null;
    input: string;
    output: string;
    cache_creation: string;
    cache_read: string;
  }>;
  return rows.map((r) => ({
    day: r.day,
    groupId: r.group_id,
    model: r.model,
    source: r.source,
    deviceId: r.device_id,
    inputTokens: Number(r.input),
    outputTokens: Number(r.output),
    cacheCreationTokens: Number(r.cache_creation),
    cacheReadTokens: Number(r.cache_read),
  }));
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
  /** Which models the group used (and precise token counts) over the weekly
   *  window — the broader, more stable view than the 5h session. */
  models: ModelUsage[];
}

/** Per-device usage over the windows. Like a group, the official account pct is
 *  split across devices by each device's local billable-token share. */
export interface LiveDeviceUsage {
  deviceId: string;
  name: string;
  os: "mac" | "linux" | "windows" | null;
  hostname: string | null;
  groupName: string | null;
  lastSeenAt: Date | null;
  sessionPct: number;
  weeklyPct: number;
  sessionTokens: number;
  weeklyTokens: number;
  /** Models this device used over the weekly window. */
  models: ModelUsage[];
}

/** Per-source usage over the windows: Claude Code (`cli`) vs Claude Desktop
 *  (`desktop`). Same Hamilton split of the official account pct as groups/devices,
 *  keyed by the record's originating app. */
export interface LiveSourceUsage {
  source: string;
  label: string;
  sessionPct: number;
  weeklyPct: number;
  sessionTokens: number;
  weeklyTokens: number;
  models: ModelUsage[];
}

const SOURCE_LABELS: Record<string, string> = {
  cli: "Claude Code",
  desktop: "Claude Desktop",
};

/** "How much was used" at three scopes: the current UTC day, the current UTC
 *  calendar month, and the whole tracked history. */
export interface UsageTotals {
  today: TokenTotals;
  month: TokenTotals;
  allTime: TokenTotals;
}

/** All of the user's groups (id → name, color), independent of any window —
 *  the chart resolves group names/colors from this so groups active only in an
 *  older range still render with their real identity (not a raw id). */
export interface GroupCatalogEntry {
  id: string;
  name: string;
  color: string;
}

/** All of the user's devices (id → name), for the chart's device filter. */
export interface DeviceCatalogEntry {
  id: string;
  name: string;
}

/** One group's consumption within a compare scope (today/month/all-time). */
export interface GroupCompareRow {
  /** groupId, or "ungrouped". */
  key: string;
  name: string;
  color: string;
  billableTokens: number;
  totalTokens: number;
}

/** Group-vs-group consumption at the three usage-totals scopes. */
export interface GroupCompare {
  today: GroupCompareRow[];
  month: GroupCompareRow[];
  allTime: GroupCompareRow[];
}

const UNGROUPED_COLOR = "#94a3b8";

/** Resolve a per-group totals map into sorted, named, coloured compare rows. */
function groupCompareRows(
  totals: Map<string, TokenTotals>,
  catalog: Map<string, { name: string; color: string }>,
): GroupCompareRow[] {
  const rows: GroupCompareRow[] = [];
  for (const [key, t] of totals) {
    const meta =
      key === "ungrouped"
        ? { name: "Ungrouped", color: UNGROUPED_COLOR }
        : catalog.get(key);
    rows.push({
      key,
      name: meta?.name ?? "Unknown",
      color: meta?.color ?? UNGROUPED_COLOR,
      billableTokens: billableTokens(t),
      totalTokens: t.totalTokens,
    });
  }
  // Billable desc, key as a stable tiebreak so equal-token groups never flip.
  rows.sort(
    (a, b) => b.billableTokens - a.billableTokens || a.key.localeCompare(b.key),
  );
  return rows;
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
  /** Every group the user owns (id → name/color), for stable chart identity. */
  groupCatalog: GroupCatalogEntry[];
  /** Per-device breakdown (same split method as groups), weekly-sorted. */
  devices: LiveDeviceUsage[];
  /** Every device the user owns (id → name), for the chart's device filter. */
  deviceCatalog: DeviceCatalogEntry[];
  /** Per-source breakdown (Claude Code vs Claude Desktop), weekly-sorted. */
  sources: LiveSourceUsage[];
  /** Account-wide per-model breakdown over the weekly window. */
  models: ModelUsage[];
  /** Daily billable-token timeline over the weekly window (headline chart). */
  timeline: TimelineBucket[];
  /** Hourly billable-token timeline over the last 24h. */
  timelineHourly: TimelineBucket[];
  /** Daily timeline over the last 30 days (chart's "30d" range). */
  timeline30d: TimelineBucket[];
  /** Monthly timeline over the whole history (chart's "Month" range). */
  timelineMonthly: TimelineBucket[];
  /** Daily timeline over the WHOLE tracked history — powers the custom range. */
  timelineDaily: TimelineBucket[];
  /** Group-vs-group consumption at today / month / all-time scopes. */
  groupCompare: GroupCompare;
  /** Consumed tokens for today / this month / all-time. */
  usageTotals: UsageTotals;
  /** Per-day consumption ledger, newest first (whole history). */
  dailyLedger: UsagePeriod[];
  /** Per-month consumption ledger, newest first (whole history). */
  monthlyLedger: UsagePeriod[];
  /** Account-wide folded token totals for the weekly / 5h windows. */
  weeklyTotals: TokenTotals;
  sessionTotals: TokenTotals;
  /** Non-revoked devices with no activity in either window. */
  idleDeviceCount: number;
}

const FIVE_H_MS = 5 * 60 * 60 * 1000;
const SEVEN_D_MS = 7 * 24 * 60 * 60 * 1000;

/** An account may have at most this many groups. Each group is budgeted an equal
 *  slice of the account limit (1/MAX_GROUPS), so a group's percentage is measured
 *  against that slice — e.g. with 2 groups, a group at its half-budget reads 100%
 *  while the account is only at 50%. */
export const MAX_GROUPS = 2;

/** Scale an account-share pct to a per-group "half budget" pct (cap 100). */
const groupBudgetPct = (sharePct: number) =>
  Math.min(100, sharePct * MAX_GROUPS);

/** Split an official account-wide percentage across an arbitrary key (group or
 *  device) by each key's share of local billable tokens within the window. */
interface ShareEntry {
  pct: number;
  tokens: number;
  models: ModelUsage[];
}

function splitByShare(
  events: UsageRecord[],
  windowStart: Date,
  now: Date,
  officialPct: number,
  keyOf: (e: UsageRecord) => string | null = (e) => e.groupId ?? null,
): Map<string | null, ShareEntry> {
  const inWin = events.filter((e) => {
    const t = e.ts.getTime();
    return t >= windowStart.getTime() && t <= now.getTime();
  });
  const byKey = new Map<string | null, UsageRecord[]>();
  for (const e of inWin) {
    const k = keyOf(e);
    const arr = byKey.get(k);
    if (arr) arr.push(e);
    else byKey.set(k, [e]);
  }
  const tokensByKey = new Map<string | null, number>();
  const modelsByKey = new Map<string | null, ModelUsage[]>();
  let total = 0;
  for (const [k, evs] of byKey) {
    const tok = billableTokens(foldAndSum(evs));
    tokensByKey.set(k, tok);
    modelsByKey.set(k, modelBreakdown(evs));
    total += tok;
  }
  const models = (k: string | null) => modelsByKey.get(k) ?? [];
  const out = new Map<string | null, ShareEntry>();

  // Largest-remainder (Hamilton) apportionment so per-key pcts sum EXACTLY to
  // the integer official pct (avoids the rounding drift of independent rounds).
  const target = Math.max(0, Math.round(officialPct));
  if (total <= 0 || target === 0) {
    for (const [k, tok] of tokensByKey) {
      out.set(k, { tokens: tok, pct: 0, models: models(k) });
    }
    return out;
  }
  const rows = [...tokensByKey].map(([k, tok]) => {
    const exact = target * (tok / total);
    const floor = Math.floor(exact);
    return { k, tok, floor, frac: exact - floor };
  });
  let leftover = target - rows.reduce((s, r) => s + r.floor, 0);
  rows.sort((a, b) => b.frac - a.frac);
  for (let i = 0; i < rows.length && leftover > 0; i++, leftover--) {
    rows[i].floor += 1;
  }
  for (const r of rows) {
    out.set(r.k, { tokens: r.tok, pct: r.floor, models: models(r.k) });
  }
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

  const emptyExtras = {
    groupCatalog: [] as GroupCatalogEntry[],
    devices: [] as LiveDeviceUsage[],
    deviceCatalog: [] as DeviceCatalogEntry[],
    sources: [] as LiveSourceUsage[],
    models: [] as ModelUsage[],
    timeline: [] as TimelineBucket[],
    timelineHourly: [] as TimelineBucket[],
    timeline30d: [] as TimelineBucket[],
    timelineMonthly: [] as TimelineBucket[],
    timelineDaily: [] as TimelineBucket[],
    groupCompare: {
      today: [] as GroupCompareRow[],
      month: [] as GroupCompareRow[],
      allTime: [] as GroupCompareRow[],
    },
    usageTotals: {
      today: { ...EMPTY_TOTALS },
      month: { ...EMPTY_TOTALS },
      allTime: { ...EMPTY_TOTALS },
    },
    dailyLedger: [] as UsagePeriod[],
    monthlyLedger: [] as UsagePeriod[],
    weeklyTotals: { ...EMPTY_TOTALS },
    sessionTotals: { ...EMPTY_TOTALS },
    idleDeviceCount: 0,
  };

  if (!hasLimits) {
    return { connected: false, groups: [], ...emptyExtras, ...base };
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
  // Events, the group list, device metadata, and the all-time daily aggregates
  // are independent — one round-trip.
  const [events, groupRows, deviceRows, aggRows] = await Promise.all([
    loadRecentEvents(userId, earliest),
    db.select().from(groups).where(eq(groups.ownerId, userId)),
    listDevices(userId),
    loadDailyAggregates(userId),
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
    // Measured against the group's slice of the account limit (1/MAX_GROUPS), so
    // a group filling its budget reads 100% while the account is below 100%.
    sessionPct: groupBudgetPct(sessionSplit.get(id)?.pct ?? 0),
    weeklyPct: groupBudgetPct(weeklySplit.get(id)?.pct ?? 0),
    sessionTokens: sessionSplit.get(id)?.tokens ?? 0,
    weeklyTokens: weeklySplit.get(id)?.tokens ?? 0,
    // Model breakdown over the weekly window (matches the weekly token figure).
    models: weeklySplit.get(id)?.models ?? [],
  }));
  groupUsages.sort((a, b) => b.weeklyTokens - a.weeklyTokens);

  // Per-device split — same Hamilton apportionment, keyed by deviceId. Device
  // pcts sum to the official pct exactly, just like groups.
  const deviceKey = (e: UsageRecord) => e.deviceId ?? null;
  const sessionDeviceSplit = splitByShare(events, fiveStart, now, base.fiveHourPct, deviceKey);
  const weeklyDeviceSplit = splitByShare(events, weekStart, now, base.sevenDayPct, deviceKey);
  const deviceById = new Map(deviceRows.map((d) => [d.id, d]));
  const deviceKeys = new Set<string | null>([
    ...sessionDeviceSplit.keys(),
    ...weeklyDeviceSplit.keys(),
  ]);
  const deviceUsages: LiveDeviceUsage[] = [...deviceKeys]
    .filter((id): id is string => id !== null) // deviceId is NOT NULL — drop the impossible null bucket
    .map((id) => {
      const meta = deviceById.get(id);
      return {
        deviceId: id,
        name: meta?.name ?? "Unknown device",
        os: meta?.os ?? null,
        hostname: meta?.hostname ?? null,
        groupName: meta?.groupName ?? null,
        lastSeenAt: meta?.lastSeenAt ?? null,
        sessionPct: sessionDeviceSplit.get(id)?.pct ?? 0,
        weeklyPct: weeklyDeviceSplit.get(id)?.pct ?? 0,
        sessionTokens: sessionDeviceSplit.get(id)?.tokens ?? 0,
        weeklyTokens: weeklyDeviceSplit.get(id)?.tokens ?? 0,
        models: weeklyDeviceSplit.get(id)?.models ?? [],
      };
    });
  deviceUsages.sort((a, b) => b.weeklyTokens - a.weeklyTokens);

  const activeDeviceIds = new Set(deviceUsages.map((d) => d.deviceId));
  const idleDeviceCount = deviceRows.filter(
    (d) => !d.revoked && !activeDeviceIds.has(d.id),
  ).length;

  // Per-source split (Claude Code vs Claude Desktop) — same apportionment, keyed
  // by the record's originating app. Legacy rows with no source read as `cli`.
  const sourceKey = (e: UsageRecord) => e.source ?? "cli";
  const sessionSourceSplit = splitByShare(events, fiveStart, now, base.fiveHourPct, sourceKey);
  const weeklySourceSplit = splitByShare(events, weekStart, now, base.sevenDayPct, sourceKey);
  const sourceKeys = new Set<string | null>([
    ...sessionSourceSplit.keys(),
    ...weeklySourceSplit.keys(),
  ]);
  const sourceUsages: LiveSourceUsage[] = [...sourceKeys]
    .filter((k): k is string => k !== null)
    .map((k) => ({
      source: k,
      label: SOURCE_LABELS[k] ?? k,
      sessionPct: sessionSourceSplit.get(k)?.pct ?? 0,
      weeklyPct: weeklySourceSplit.get(k)?.pct ?? 0,
      sessionTokens: sessionSourceSplit.get(k)?.tokens ?? 0,
      weeklyTokens: weeklySourceSplit.get(k)?.tokens ?? 0,
      models: weeklySourceSplit.get(k)?.models ?? [],
    }));
  sourceUsages.sort((a, b) => b.weeklyTokens - a.weeklyTokens);

  // Fold the weekly window ONCE; reuse it for totals, model breakdown, timeline.
  const weeklyFolded = foldEvents(filterByWindow(events, weekStart, now));
  const weeklyTotals = sumRecords(weeklyFolded);
  const sessionTotals = foldAndSum(filterByWindow(events, fiveStart, now));
  const models = modelBreakdown(weeklyFolded);
  const timeline = buildTimelineFromFolded(weeklyFolded, weekStart, now, "day");
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const timelineHourly = buildTimelineFromFolded(weeklyFolded, dayAgo, now, "hour");

  // All-time usage figures, derived from the cheap daily aggregates.
  const todayK = dayKey(now);
  const monthK = monthKey(now);
  const usageTotals: UsageTotals = {
    today: totalsForDay(aggRows, todayK),
    month: totalsForMonth(aggRows, monthK),
    allTime: sumAgg(aggRows),
  };
  const thirtyStart = new Date(now.getTime() - 29 * DAY_MS);
  const timeline30d = aggToDailyBuckets(aggRows, thirtyStart, now);
  // Monthly chart spans the earliest active month through the current one.
  let earliestDay = todayK;
  for (const r of aggRows) if (r.day < earliestDay) earliestDay = r.day;
  const monthStart = new Date(`${earliestDay.slice(0, 7)}-01T00:00:00.000Z`);
  const timelineMonthly = aggToMonthlyBuckets(aggRows, monthStart, now);
  // All-time daily series — the client slices any custom [start, end] from it.
  const timelineDaily = aggToDailyBuckets(
    aggRows,
    new Date(`${earliestDay}T00:00:00.000Z`),
    now,
  );

  // Full group/device catalogs (every owned entity, window-independent) so the
  // chart resolves names/colours even for groups/devices active only long ago.
  const groupCatalog: GroupCatalogEntry[] = groupRows.map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
  }));
  const deviceCatalog: DeviceCatalogEntry[] = deviceRows.map((d) => ({
    id: d.id,
    name: d.name ?? "Unknown device",
  }));
  const catalogMeta = new Map(
    groupRows.map((g) => [g.id, { name: g.name, color: g.color }]),
  );
  const groupCompare: GroupCompare = {
    today: groupCompareRows(
      groupTotals(aggRows, (r) => r.day === todayK),
      catalogMeta,
    ),
    month: groupCompareRows(
      groupTotals(aggRows, (r) => r.day.startsWith(monthK)),
      catalogMeta,
    ),
    allTime: groupCompareRows(groupTotals(aggRows), catalogMeta),
  };

  return {
    connected: true,
    groups: groupUsages,
    groupCatalog,
    devices: deviceUsages,
    deviceCatalog,
    sources: sourceUsages,
    models,
    timeline,
    timelineHourly,
    timeline30d,
    timelineMonthly,
    timelineDaily,
    groupCompare,
    usageTotals,
    dailyLedger: dailyLedger(aggRows),
    monthlyLedger: monthlyLedger(aggRows),
    weeklyTotals,
    sessionTotals,
    idleDeviceCount,
    ...base,
  };
}

/** DTO form of a device usage row (lastSeenAt → ISO). */
export interface DeviceUsageDTO extends Omit<LiveDeviceUsage, "lastSeenAt"> {
  lastSeenAt: string | null;
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
  groupCatalog: GroupCatalogEntry[];
  devices: DeviceUsageDTO[];
  deviceCatalog: DeviceCatalogEntry[];
  sources: LiveSourceUsage[];
  models: ModelUsage[];
  timeline: TimelineBucket[];
  timelineHourly: TimelineBucket[];
  timeline30d: TimelineBucket[];
  timelineMonthly: TimelineBucket[];
  timelineDaily: TimelineBucket[];
  groupCompare: GroupCompare;
  usageTotals: UsageTotals;
  dailyLedger: UsagePeriod[];
  monthlyLedger: UsagePeriod[];
  weeklyTotals: TokenTotals;
  sessionTotals: TokenTotals;
  idleDeviceCount: number;
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
    groupCatalog: d.groupCatalog,
    devices: d.devices.map((dev) => ({
      ...dev,
      lastSeenAt: dev.lastSeenAt?.toISOString() ?? null,
    })),
    deviceCatalog: d.deviceCatalog,
    sources: d.sources,
    models: d.models,
    timeline: d.timeline,
    timelineHourly: d.timelineHourly,
    timeline30d: d.timeline30d,
    timelineMonthly: d.timelineMonthly,
    timelineDaily: d.timelineDaily,
    groupCompare: d.groupCompare,
    usageTotals: d.usageTotals,
    dailyLedger: d.dailyLedger,
    monthlyLedger: d.monthlyLedger,
    weeklyTotals: d.weeklyTotals,
    sessionTotals: d.sessionTotals,
    idleDeviceCount: d.idleDeviceCount,
  };
}

/** The user's "default" group — the oldest one, or a freshly created "Default"
 *  if the user has none. Used so a device is never left without a group. */
export async function ensureDefaultGroup(userId: string) {
  const existing = await db
    .select()
    .from(groups)
    .where(eq(groups.ownerId, userId))
    .orderBy(asc(groups.createdAt))
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(groups)
    .values({ id: randomUUID(), ownerId: userId, name: "Default", color: "#6366f1" })
    .returning();
  return inserted[0];
}

/** Move any of the user's devices that have no group into the default group.
 *  Idempotent and cheap (a no-op once every device is grouped); enforces the
 *  "no ungrouped devices" invariant for legacy rows. */
export async function backfillUngroupedDevices(userId: string): Promise<void> {
  const orphan = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.userId, userId), isNull(devices.groupId)))
    .limit(1);
  if (!orphan[0]) return; // common case — nothing ungrouped, don't create a group
  const def = await ensureDefaultGroup(userId);
  await db
    .update(devices)
    .set({ groupId: def.id })
    .where(and(eq(devices.userId, userId), isNull(devices.groupId)));
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
