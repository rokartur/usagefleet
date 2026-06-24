import { foldEvents } from "./fold";
import type { UsageRecord } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type TimelineGranularity = "day" | "hour";

export interface TimelineBucket {
  /** ISO timestamp of the bucket start (UTC day/hour start). */
  ts: string;
  /** Short display label: "Jun 18" (daily) or "10:00" (hourly), in UTC. */
  label: string;
  /** Total BILLABLE tokens (input+output+cacheCreation, EXCLUDES cacheRead). */
  total: number;
  /** Billable tokens per group key. Null groupId is keyed "ungrouped". */
  byGroup: Record<string, number>;
  /** Billable tokens per model key. Absent model is keyed "unknown". */
  byModel: Record<string, number>;
}

/** Billable tokens for one record — mirrors `billableTokens` (excludes cacheRead). */
function billableOf(e: UsageRecord): number {
  return e.inputTokens + e.outputTokens + e.cacheCreationTokens;
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
 * bucket / group / model using billable tokens. Every bucket from floor(start) to
 * floor(end) is present (zero-filled) so the chart x-axis is continuous.
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
  for (let b = first; b <= last; b += bucketMs) {
    buckets.set(b, {
      ts: new Date(b).toISOString(),
      label: labelFor(b, granularity),
      total: 0,
      byGroup: {},
      byModel: {},
    });
  }

  for (const ev of folded) {
    const t = ev.ts.getTime();
    if (t < s || t > e) continue;
    const tok = billableOf(ev);
    if (tok === 0) continue; // pure cache-read rows add nothing; don't pollute keys
    const bucket = buckets.get(floorBucket(t, bucketMs));
    if (!bucket) continue; // defensive; in-window events always land in a bucket
    bucket.total += tok;
    const gk = ev.groupId ?? "ungrouped";
    bucket.byGroup[gk] = (bucket.byGroup[gk] ?? 0) + tok;
    const mk = ev.model ?? "unknown";
    bucket.byModel[mk] = (bucket.byModel[mk] ?? 0) + tok;
  }

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
