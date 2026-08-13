import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { devices, groups, type StoredModelLimit, usageEvents, userSettings } from "@/db/schema";
import {
  billableTokens,
  type CacheTtl,
  computeDashboardUsage,
  costForTokens,
  costUsd,
  type DailyAggRow,
  type DashboardUsage,
  EMPTY_TOTALS,
  filterByWindow,
  foldEvents,
  modelBreakdown,
  modelLabel,
  type ModelUsage,
  monthKey,
  pastWindowStarts,
  pct,
  refreshPrices,
  sumAgg,
  sumRecords,
  type TokenTotals,
  type UsageRecord,
  weekWindowStart,
} from "@/lib/usage";

// The logical-message fold key: (messageId, requestId) when present, else the
// row's own uuid. Prefixed so a uuid can never collide with a messageId pair.
const FOLD_KEY = sql`CASE WHEN ${usageEvents.messageId} IS NOT NULL THEN 'm:' || ${usageEvents.messageId} || '::' || coalesce(${usageEvents.requestId}, '') ELSE 'u:' || ${usageEvents.uuid} END`;
const ROW_TOTAL = sql`(${usageEvents.inputTokens} + ${usageEvents.outputTokens} + ${usageEvents.cacheCreationTokens} + ${usageEvents.cacheReadTokens})`;

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
    (await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1))[0]
  );
}

/** Events for a user at or after `cutoff`, joined to their device's group. */
export async function loadRecentEvents(userId: string, cutoff: Date): Promise<UsageRecord[]> {
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
export async function loadDailyAggregates(userId: string): Promise<DailyAggRow[]> {
  const result = await db.execute(sql`
    WITH folded AS (
      SELECT DISTINCT ON (${FOLD_KEY})
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
      ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
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

export async function getDashboard(userId: string, now: Date): Promise<DashboardUsage> {
  await refreshPrices();
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
  /** Usage measured against the group's budget slice (1/maxGroups of the
   *  account limit) — the "am I eating the other group's half?" view. */
  sessionBudgetPct: number;
  weeklyBudgetPct: number;
  sessionTokens: number;
  weeklyTokens: number;
  /** All-bucket totals (incl. cache_read) — comparable with ccusage's Total. */
  sessionTotalTokens: number;
  weeklyTotalTokens: number;
  /** Which models the group used (and precise token counts) over the 5h
   *  session window. */
  sessionModels: ModelUsage[];
  /** Which models the group used over the weekly window — the broader, more
   *  stable view than the 5h session. */
  models: ModelUsage[];
}

/** Token totals + USD cost (at public API list prices) for one spend period. */
export interface SpendPeriod {
  totals: TokenTotals;
  costUsd: number;
}

/** Money spent over the current weekly window and the current UTC calendar
 *  month. Cost is accrued per model (rates differ), then summed. */
export interface Spend {
  week: SpendPeriod;
  month: SpendPeriod;
}

const emptySpend = (): Spend => ({
  week: { totals: { ...EMPTY_TOTALS }, costUsd: 0 },
  month: { totals: { ...EMPTY_TOTALS }, costUsd: 0 },
});

/** One group's slice of a per-model official limit. */
export interface LiveModelLimitGroup {
  groupId: string | null;
  name: string;
  color: string;
  /** Against the group's budget slice (1/maxGroups), like sessionBudgetPct. */
  budgetPct: number;
  /** Billable tokens of this model family in the limit's window. */
  tokens: number;
}

/** A per-model official limit (e.g. the Fable weekly cap) with the same
 *  local-token-share group split as the session/weekly limits. */
export interface LiveModelLimit {
  /** Model family key from the rate-limit header ("fable", "opus"). */
  model: string;
  /** Friendly label ("Fable"). */
  label: string;
  /** Window key from the header ("5h", "7d"). */
  window: string;
  /** Claude's official utilization for this model limit. */
  pct: number;
  resetsAt: Date | null;
  groups: LiveModelLimitGroup[];
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
  /** Per-model official limits (e.g. Fable weekly), group-split like above. */
  modelLimits: LiveModelLimit[];
  /** Money spent this week (weekly window) and this calendar month. */
  spend: Spend;
}

const HOUR_MS = 60 * 60 * 1000;
const FIVE_H_MS = 5 * HOUR_MS;
const SEVEN_D_MS = 7 * 24 * HOUR_MS;

/** Duration of a rate-limit window key ("5h", "7d", …); null when unparseable.
 *  Months are approximated as 30 days — only the split window, not limit math. */
function windowDurationMs(window: string): number | null {
  const m = window.match(/^(\d+)([hdwm])$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit =
    m[2] === "h"
      ? HOUR_MS
      : m[2] === "d"
        ? 24 * HOUR_MS
        : m[2] === "w"
          ? 7 * 24 * HOUR_MS
          : 30 * 24 * HOUR_MS;
  return n * unit;
}

/** Scale an account-share pct to a per-group budget pct (1/maxGroups slice of
 *  the account limit) — e.g. with 2 groups, a group at its half-budget reads
 *  100% while the account is only at 50%. Uncapped: past 100% the group has
 *  overrun its slice and is eating another group's, which is worth seeing.
 *  Takes the *unrounded* share so the ×maxGroups multiply doesn't amplify a
 *  rounding error (at maxGroups=10 a 0.5pt rounding would become 5pt). */
const groupBudgetPct = (share: ShareEntry | undefined, maxGroups: number) =>
  Math.round((share?.exactPct ?? 0) * maxGroups);

/** Split an official account-wide percentage across an arbitrary key (group or
 *  device) by each key's share of estimated cost (API list prices) within the
 *  window — weights buckets (output 5×, cache write 1.25×, cache read 0.1×) and
 *  models (Fable > Opus > Sonnet > Haiku) like Anthropic's cost-based limit
 *  accounting. Token fields stay billable/total for display. */
interface ShareEntry {
  /** This key's share of the official pct, unrounded — scaled to a budget pct
   *  before display, so rounding happens once, at the end. */
  exactPct: number;
  tokens: number;
  /** All-bucket total (incl. cache_read); display only, never used for splits. */
  totalTokens: number;
  models: ModelUsage[];
}

function splitByShare(
  events: UsageRecord[],
  windowStart: Date,
  now: Date,
  officialPct: number,
  ttl: CacheTtl = "1h",
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
  const totalByKey = new Map<string | null, number>();
  const costByKey = new Map<string | null, number>();
  const modelsByKey = new Map<string | null, ModelUsage[]>();
  let totalCost = 0;
  for (const [k, evs] of byKey) {
    const folded = foldEvents(evs);
    const totals = sumRecords(folded);
    tokensByKey.set(k, billableTokens(totals));
    totalByKey.set(k, totals.totalTokens);
    const cost = folded.reduce((s, e) => s + costUsd(e, ttl), 0);
    costByKey.set(k, cost);
    modelsByKey.set(k, modelBreakdown(evs));
    totalCost += cost;
  }
  const models = (k: string | null) => modelsByKey.get(k) ?? [];
  const out = new Map<string | null, ShareEntry>();

  const target = Math.max(0, officialPct);
  for (const [k, tok] of tokensByKey) {
    out.set(k, {
      tokens: tok,
      totalTokens: totalByKey.get(k) ?? 0,
      exactPct: totalCost > 0 ? target * ((costByKey.get(k) ?? 0) / totalCost) : 0,
      models: models(k),
    });
  }
  return out;
}

/**
 * Real per-account utilization as last reported by the collector (which reads
 * it from the local Claude Code login), with a local token-share split per
 * group. `connected: false` until the collector has reported once.
 */
export async function getLiveDashboard(userId: string, now: Date): Promise<LiveDashboard> {
  const settings = await ensureSettings(userId);
  const hasLimits = settings.fiveHourPct !== null || settings.sevenDayPct !== null;

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
    return {
      connected: false,
      groups: [],
      modelLimits: [],
      spend: emptySpend(),
      ...base,
    };
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

  // Per-model limit windows (e.g. Fable weekly), clamped the same way. Entries
  // with no reported pct can't be split — drop them up front.
  const modelWindows = (settings.modelLimits ?? [])
    .filter((m): m is StoredModelLimit & { pct: number } => m.pct != null)
    .map((m) => {
      const dur = windowDurationMs(m.window) ?? SEVEN_D_MS;
      const parsed = m.resetsAt ? new Date(m.resetsAt) : null;
      const resetsAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
      const start = new Date(
        Math.max((resetsAt ?? new Date(now.getTime() - dur)).getTime() - dur, now.getTime() - dur),
      );
      return { entry: m, start, resetsAt };
    });

  // Load only what the windows need (covers a future reset too), not a fixed 8d.
  const earliest = new Date(
    Math.min(
      weekStart.getTime(),
      fiveStart.getTime(),
      ...modelWindows.map((w) => w.start.getTime()),
    ) -
      5 * 60 * 1000,
  );
  // Events, the group list and the all-time daily aggregates are independent —
  // one round-trip.
  const [events, groupRows, aggRows] = await Promise.all([
    loadRecentEvents(userId, earliest),
    db.select().from(groups).where(eq(groups.ownerId, userId)),
    loadDailyAggregates(userId),
  ]);

  const ttl: CacheTtl = settings.cacheWriteTtl === "5m" ? "5m" : "1h";
  const sessionSplit = splitByShare(events, fiveStart, now, base.fiveHourPct, ttl);
  const weeklySplit = splitByShare(events, weekStart, now, base.sevenDayPct, ttl);

  const keys = new Set<string | null>([...sessionSplit.keys(), ...weeklySplit.keys()]);
  const nameFor = (id: string | null) =>
    id === null ? "Ungrouped" : (groupRows.find((g) => g.id === id)?.name ?? "Unknown");
  const colorFor = (id: string | null) =>
    id === null ? "#94a3b8" : (groupRows.find((g) => g.id === id)?.color ?? "#94a3b8");

  const groupUsages: LiveGroupUsage[] = [...keys].map((id) => ({
    groupId: id,
    name: nameFor(id),
    color: colorFor(id),
    // Usage against the group's budget slice (1/maxGroups): a group filling
    // its share reads 100% while the account is at 50%.
    sessionBudgetPct: groupBudgetPct(sessionSplit.get(id), settings.maxGroups),
    weeklyBudgetPct: groupBudgetPct(weeklySplit.get(id), settings.maxGroups),
    sessionTokens: sessionSplit.get(id)?.tokens ?? 0,
    weeklyTokens: weeklySplit.get(id)?.tokens ?? 0,
    sessionTotalTokens: sessionSplit.get(id)?.totalTokens ?? 0,
    weeklyTotalTokens: weeklySplit.get(id)?.totalTokens ?? 0,
    // Model breakdowns per window (each matches that window's token figure).
    sessionModels: sessionSplit.get(id)?.models ?? [],
    models: weeklySplit.get(id)?.models ?? [],
  }));
  groupUsages.sort((a, b) => b.weeklyTokens - a.weeklyTokens);

  // Per-model official limits: split each model cap across groups by that model
  // family's local cost share within the limit's own window — the same cost
  // split (and per-group budget scaling) as the session/weekly limits above.
  const modelLimits: LiveModelLimit[] = modelWindows.map(({ entry, start, resetsAt }) => {
    const familyEvents = events.filter((e) => (e.model ?? "").toLowerCase().includes(entry.model));
    const split = splitByShare(familyEvents, start, now, entry.pct, ttl);
    const groupRowsFor: LiveModelLimitGroup[] = [...split.entries()].map(([id, s]) => ({
      groupId: id,
      name: nameFor(id),
      color: colorFor(id),
      budgetPct: groupBudgetPct(s, settings.maxGroups),
      tokens: s.tokens,
    }));
    groupRowsFor.sort((a, b) => b.tokens - a.tokens);
    return {
      model: entry.model,
      label: modelLabel(entry.model),
      window: entry.window,
      pct: Math.min(100, Math.max(0, entry.pct)),
      resetsAt,
      groups: groupRowsFor,
    };
  });

  // Weekly-window spend: fold once, then price each logical message by its own
  // model. Monthly spend comes from the pre-folded daily aggregates, priced per
  // (day × group × model) cell the same way.
  await refreshPrices();
  const weeklyFolded = foldEvents(filterByWindow(events, weekStart, now));
  const monthK = monthKey(now);
  const monthRows = aggRows.filter((r) => r.day.startsWith(monthK));
  const spend: Spend = {
    week: {
      totals: sumRecords(weeklyFolded),
      costUsd: weeklyFolded.reduce((s, e) => s + costUsd(e, ttl), 0),
    },
    month: {
      totals: sumAgg(monthRows),
      costUsd: monthRows.reduce((s, r) => s + costForTokens(r, r.model, ttl), 0),
    },
  };

  return {
    connected: true,
    groups: groupUsages,
    modelLimits,
    spend,
    ...base,
  };
}

/** How many completed windows back the past-windows card looks. */
const PAST_WINDOWS = 8;

/** Folded token totals for one (window bucket × group) cell. */
interface WindowAggRow {
  /** Bucket start, epoch ms, aligned to the limit's own reset boundary. */
  binStart: number;
  groupId: string | null;
  totals: TokenTotals;
}

/** Same logical-message fold as {@link loadDailyAggregates}, but bucketed into
 *  rolling `strideMs` windows aligned to `origin` and grouped per group only. */
async function loadWindowAggregates(
  userId: string,
  strideMs: number,
  origin: Date,
  since: Date,
  until: Date,
): Promise<WindowAggRow[]> {
  const bucket = sql`date_bin(make_interval(secs => ${strideMs / 1000}::float8), folded.ts, ${origin.toISOString()}::timestamptz)`;
  const result = await db.execute(sql`
    WITH folded AS (
      SELECT DISTINCT ON (${FOLD_KEY})
        ${usageEvents.ts} AS ts,
        ${usageEvents.deviceId} AS device_id,
        ${usageEvents.inputTokens} AS input_tokens,
        ${usageEvents.outputTokens} AS output_tokens,
        ${usageEvents.cacheCreationTokens} AS cache_creation_tokens,
        ${usageEvents.cacheReadTokens} AS cache_read_tokens
      FROM ${usageEvents}
      WHERE ${usageEvents.userId} = ${userId}
        AND ${usageEvents.ts} >= ${since.toISOString()}::timestamptz
        AND ${usageEvents.ts} < ${until.toISOString()}::timestamptz
      ORDER BY ${FOLD_KEY}, ${ROW_TOTAL} DESC, ${usageEvents.ts} ASC
    )
    SELECT
      extract(epoch from ${bucket})::bigint AS bin,
      d.group_id AS group_id,
      sum(folded.input_tokens)::bigint AS input,
      sum(folded.output_tokens)::bigint AS output,
      sum(folded.cache_creation_tokens)::bigint AS cache_creation,
      sum(folded.cache_read_tokens)::bigint AS cache_read
    FROM folded
    JOIN ${devices} d ON d.id = folded.device_id
    GROUP BY 1, 2
    HAVING (
      sum(folded.input_tokens) + sum(folded.output_tokens) +
      sum(folded.cache_creation_tokens) + sum(folded.cache_read_tokens)
    ) > 0
  `);

  const rows = result as unknown as Array<{
    bin: string;
    group_id: string | null;
    input: string;
    output: string;
    cache_creation: string;
    cache_read: string;
  }>;
  return rows.map((r) => {
    const totals = {
      inputTokens: Number(r.input),
      outputTokens: Number(r.output),
      cacheCreationTokens: Number(r.cache_creation),
      cacheReadTokens: Number(r.cache_read),
      totalTokens:
        Number(r.input) + Number(r.output) + Number(r.cache_creation) + Number(r.cache_read),
    } satisfies TokenTotals;
    return { binStart: Number(r.bin) * 1000, groupId: r.group_id, totals };
  });
}

/** One group's slice of a past limit window. */
export interface PastWindowGroup {
  groupId: string | null;
  name: string;
  color: string;
  /** This group's billable tokens against the configured plan limit; the
   *  groups of a window sum to the window's total utilization, which reads past
   *  100 when the limit was overshot. */
  limitPct: number;
  /** Billable tokens (cache reads excluded). */
  tokens: number;
}

/** One completed 5h / weekly window with its per-group split. */
export interface PastWindow {
  start: string;
  end: string;
  /** Billable tokens burned in the window, all groups. */
  tokens: number;
  groups: PastWindowGroup[];
}

export interface WindowHistoryDTO {
  sessions: PastWindow[];
  weeks: PastWindow[];
}

/** Fold bucketed rows into per-window group splits, newest window first.
 *  Claude only reports official utilization for the window that is open right
 *  now, so a past window is measured against the CONFIGURED plan limit
 *  (`limitTokens`) — an estimate that can read past 100% on an overshoot.
 *  Windows with no activity are dropped. */
function buildPastWindows(
  rows: WindowAggRow[],
  starts: Date[],
  strideMs: number,
  limitTokens: number,
  label: (id: string | null) => { name: string; color: string },
): PastWindow[] {
  const byBin = new Map<number, WindowAggRow[]>();
  for (const row of rows) {
    const bin = byBin.get(row.binStart);
    if (bin) bin.push(row);
    else byBin.set(row.binStart, [row]);
  }

  return starts
    .map((start) => {
      const cells = byBin.get(start.getTime()) ?? [];
      const tokens = cells.reduce((sum, c) => sum + billableTokens(c.totals), 0);
      return {
        start: start.toISOString(),
        end: new Date(start.getTime() + strideMs).toISOString(),
        tokens,
        groups: cells
          .map((c) => ({
            groupId: c.groupId,
            ...label(c.groupId),
            limitPct: pct(billableTokens(c.totals), limitTokens),
            tokens: billableTokens(c.totals),
          }))
          .sort((a, b) => b.tokens - a.tokens),
      };
    })
    .filter((w) => w.groups.length > 0);
}

/** The last {@link PAST_WINDOWS} completed 5h and weekly windows, split per
 *  group — the "how did we do last session/week" counterpart to the live card. */
export async function getWindowHistory(userId: string, now: Date): Promise<WindowHistoryDTO> {
  const settings = await ensureSettings(userId);
  // Anchor the buckets on the reported reset instants so they match the real
  // windows; without a report, fall back to "now" / the configured week start.
  const fiveOrigin = settings.fiveHourResetsAt ? new Date(settings.fiveHourResetsAt) : now;
  const weekOrigin = settings.sevenDayResetsAt
    ? new Date(settings.sevenDayResetsAt)
    : weekWindowStart(now, settings.weekResetWeekday, settings.weekResetHourUtc);
  const sessionStarts = pastWindowStarts(fiveOrigin, FIVE_H_MS, now, PAST_WINDOWS);
  const weekStarts = pastWindowStarts(weekOrigin, SEVEN_D_MS, now, PAST_WINDOWS);
  const span = (starts: Date[], strideMs: number) => ({
    since: starts[starts.length - 1] ?? now,
    until: new Date((starts[0] ?? now).getTime() + strideMs),
  });
  const sessionSpan = span(sessionStarts, FIVE_H_MS);
  const weekSpan = span(weekStarts, SEVEN_D_MS);

  const [groupRows, sessionRows, weekRows] = await Promise.all([
    db.select().from(groups).where(eq(groups.ownerId, userId)),
    loadWindowAggregates(userId, FIVE_H_MS, fiveOrigin, sessionSpan.since, sessionSpan.until),
    loadWindowAggregates(userId, SEVEN_D_MS, weekOrigin, weekSpan.since, weekSpan.until),
  ]);
  const label = (id: string | null) => {
    const g = id === null ? undefined : groupRows.find((x) => x.id === id);
    return {
      name: id === null ? "Ungrouped" : (g?.name ?? "Unknown"),
      color: g?.color ?? "#94a3b8",
    };
  };

  return {
    sessions: buildPastWindows(
      sessionRows,
      sessionStarts,
      FIVE_H_MS,
      settings.sessionLimitTokens,
      label,
    ),
    weeks: buildPastWindows(weekRows, weekStarts, SEVEN_D_MS, settings.weeklyLimitTokens, label),
  };
}

/** One (UTC day × group × model × source × device) aggregate with its cost —
 *  the raw all-time series the dashboard explorer filters and charts. */
export interface HistoryRow extends DailyAggRow {
  costUsd: number;
}

/** All-time history plus the labels the client needs to name its dimensions. */
export interface HistoryDTO {
  rows: HistoryRow[];
  groups: { id: string; name: string; color: string }[];
  devices: { id: string; name: string; groupId: string | null }[];
}

export async function getHistory(userId: string): Promise<HistoryDTO> {
  await refreshPrices();
  const [settings, rows, groupRows, deviceRows] = await Promise.all([
    ensureSettings(userId),
    loadDailyAggregates(userId),
    db.select().from(groups).where(eq(groups.ownerId, userId)),
    db
      .select({ id: devices.id, name: devices.name, groupId: devices.groupId })
      .from(devices)
      .where(eq(devices.userId, userId)),
  ]);
  const ttl: CacheTtl = settings.cacheWriteTtl === "5m" ? "5m" : "1h";
  return {
    rows: rows.map((r) => ({ ...r, costUsd: costForTokens(r, r.model, ttl) })),
    groups: groupRows.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    devices: deviceRows,
  };
}

/** DTO form of a per-model limit (resetsAt → ISO). */
export interface ModelLimitDTO extends Omit<LiveModelLimit, "resetsAt"> {
  resetsAt: string | null;
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
  modelLimits: ModelLimitDTO[];
  spend: Spend;
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
    modelLimits: d.modelLimits.map((m) => ({
      ...m,
      resetsAt: m.resetsAt?.toISOString() ?? null,
    })),
    spend: d.spend,
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
  return (
    db
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
      .leftJoin(groups, and(eq(devices.groupId, groups.id), eq(groups.ownerId, userId)))
      .where(eq(devices.userId, userId))
      .orderBy(desc(devices.createdAt))
  );
}
