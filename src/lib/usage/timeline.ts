import { foldEvents, recordTotal } from "./fold";
import { EMPTY_TOTALS, type TokenTotals, type UsageRecord } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type TimelineGranularity = "day" | "hour";

/** Selectable token metric for the timeline chart. `billable` is the default
 *  (input+output+cacheCreation, the share-split measure); `total` adds replayed
 *  cache reads; the rest isolate a single component. */
export type TimelineMetric =
  | "billable"
  | "total"
  | "input"
  | "output"
  | "cacheRead";

/**
 * One fully-dimensioned slice of a bucket: the token totals for a single
 * (group × model × source × device) combination. The chart re-aggregates these
 * client-side so any dimension can be split or filtered without a server round
 * trip. Keys are the same null-safe sentinels used everywhere else.
 */
export interface TimelineCell {
  /** Group key: the groupId, or "ungrouped" when the device has no group. */
  g: string;
  /** Model key: the raw model id, or "unknown" when the row carried none. */
  m: string;
  /** Source key: "cli" (Claude Code) / "desktop" (Claude Desktop); absent → "cli". */
  s: string;
  /** Device key: the deviceId, or "unknown" when absent. */
  d: string;
  totals: TokenTotals;
}

export interface TimelineBucket {
  /** ISO timestamp of the bucket start (UTC day/hour start). */
  ts: string;
  /** Short display label: "Jun 18" (daily) or "10:00" (hourly), in UTC. */
  label: string;
  /** Full token totals for the whole bucket (all components). */
  totals: TokenTotals;
  /** Token totals per group key. Null groupId is keyed "ungrouped". */
  byGroup: Record<string, TokenTotals>;
  /** Token totals per model key. Absent model is keyed "unknown". */
  byModel: Record<string, TokenTotals>;
  /** Per (group × model × source × device) slices — the filterable raw form. */
  cells: TimelineCell[];
}

/** Null-safe key for one record/row across the four chart dimensions. */
const CELL_SEP = "\u0000";
export function cellKey(g: string, m: string, s: string, d: string): string {
  return g + CELL_SEP + m + CELL_SEP + s + CELL_SEP + d;
}

/** Extract one selectable metric from a {@link TokenTotals}. */
export function metricValue(t: TokenTotals, m: TimelineMetric): number {
  switch (m) {
    case "billable":
      return t.inputTokens + t.outputTokens + t.cacheCreationTokens;
    case "total":
      return t.totalTokens;
    case "input":
      return t.inputTokens;
    case "output":
      return t.outputTokens;
    case "cacheRead":
      return t.cacheReadTokens;
  }
}

const emptyTotals = (): TokenTotals => ({ ...EMPTY_TOTALS });

/** Accumulate one record's tokens into a running totals object (mutates `t`). */
function addInto(t: TokenTotals, e: UsageRecord): void {
  t.inputTokens += e.inputTokens;
  t.outputTokens += e.outputTokens;
  t.cacheCreationTokens += e.cacheCreationTokens;
  t.cacheReadTokens += e.cacheReadTokens;
  t.totalTokens +=
    e.inputTokens + e.outputTokens + e.cacheCreationTokens + e.cacheReadTokens;
}

/** Floor an epoch-ms instant to the start of its UTC day/hour. Epoch 0 is a UTC
 *  day boundary so integer division aligns cleanly. */
function floorBucket(t: number, bucketMs: number): number {
  return Math.floor(t / bucketMs) * bucketMs;
}

function labelFor(bucketStart: number, granularity: TimelineGranularity): string {
  const d = new Date(bucketStart);
  if (granularity === "hour") {
    return `${String(d.getUTCHours()).padStart(2, "0")}:00`;
  }
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * Bucket ALREADY-FOLDED records into a dense, time-ascending series. Records are
 * window-filtered (inclusive both ends, matching `filterByWindow`) then summed by
 * bucket / group / model as full {@link TokenTotals} (the chart picks one metric
 * via {@link metricValue}). Every bucket from floor(start) to floor(end) is
 * present (zero-filled) so the chart x-axis is continuous.
 *
 * Deterministic: depends only on its inputs (no Date.now / random).
 */
function bucketize(
  folded: UsageRecord[],
  start: Date,
  end: Date,
  granularity: TimelineGranularity,
): TimelineBucket[] {
  const bucketMs = granularity === "day" ? DAY_MS : HOUR_MS;
  const s = start.getTime();
  const e = end.getTime();

  const first = floorBucket(s, bucketMs);
  const last = floorBucket(e, bucketMs);
  const buckets = new Map<number, TimelineBucket>();
  // Per-bucket cell accumulators, keyed by bucket start then by the 4-dim cell
  // key. Materialized into the bucket's `cells` array at the end.
  const cellAcc = new Map<number, Map<string, TimelineCell>>();
  for (let b = first; b <= last; b += bucketMs) {
    buckets.set(b, {
      ts: new Date(b).toISOString(),
      label: labelFor(b, granularity),
      totals: emptyTotals(),
      byGroup: {},
      byModel: {},
      cells: [],
    });
    cellAcc.set(b, new Map());
  }

  for (const ev of folded) {
    const t = ev.ts.getTime();
    if (t < s || t > e) continue;
    // Skip only truly-empty rows (e.g. "<synthetic>" placeholders Claude Code
    // emits with 0 of every token); rows that carry ONLY cache reads still count
    // toward the `cacheRead` / `total` metrics, so keep them.
    if (recordTotal(ev) === 0) continue;
    const bs = floorBucket(t, bucketMs);
    const bucket = buckets.get(bs);
    if (!bucket) continue; // defensive; in-window events always land in a bucket
    addInto(bucket.totals, ev);
    const gk = ev.groupId ?? "ungrouped";
    addInto((bucket.byGroup[gk] ??= emptyTotals()), ev);
    const mk = ev.model ?? "unknown";
    addInto((bucket.byModel[mk] ??= emptyTotals()), ev);
    const sk = ev.source ?? "cli";
    const dk = ev.deviceId ?? "unknown";
    const acc = cellAcc.get(bs)!;
    const ck = cellKey(gk, mk, sk, dk);
    let cell = acc.get(ck);
    if (!cell) acc.set(ck, (cell = { g: gk, m: mk, s: sk, d: dk, totals: emptyTotals() }));
    addInto(cell.totals, ev);
  }

  for (const [bs, acc] of cellAcc) buckets.get(bs)!.cells = [...acc.values()];

  return [...buckets.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}

/**
 * Build a token timeline from RAW events. Folds streamed segments FIRST (so one
 * logical message counts once, not once per JSONL line — see fold.ts), then
 * buckets by UTC day/hour.
 */
export function buildTimeline(
  events: UsageRecord[],
  start: Date,
  end: Date,
  granularity: TimelineGranularity,
): TimelineBucket[] {
  return bucketize(foldEvents(events), start, end, granularity);
}

/** Build a timeline from an ALREADY-FOLDED set (skips the fold). The caller is
 *  responsible for having folded; the window filter still applies. */
export function buildTimelineFromFolded(
  folded: UsageRecord[],
  start: Date,
  end: Date,
  granularity: TimelineGranularity,
): TimelineBucket[] {
  return bucketize(folded, start, end, granularity);
}

/** Daily series over [start, end] (the headline 7-day chart). */
export function buildDailyTimeline(
  events: UsageRecord[],
  start: Date,
  end: Date,
): TimelineBucket[] {
  return buildTimeline(events, start, end, "day");
}

/** Hourly series over [start, end] (e.g. the last 24h). */
export function buildHourlyTimeline(
  events: UsageRecord[],
  start: Date,
  end: Date,
): TimelineBucket[] {
  return buildTimeline(events, start, end, "hour");
}
