import type { TimelineBucket } from "./timeline";
import { EMPTY_TOTALS, type TokenTotals } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * One pre-folded, pre-bucketed usage aggregate: the token sums for a single
 * (UTC calendar day × group × model) cell. Produced DB-side by
 * `loadDailyAggregates` (folding is applied in SQL), so the whole all-time
 * history collapses to a small set of rows the dashboard can sum cheaply.
 */
export interface DailyAggRow {
  /** UTC day, "YYYY-MM-DD". */
  day: string;
  /** Device's group, or null (rendered as the "ungrouped" key). */
  groupId: string | null;
  /** Raw model id, or null ("unknown" key). */
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

/** A summed period (a day, a month, or the whole history) for the ledger/cards. */
export interface UsagePeriod {
  /** Stable key: "YYYY-MM-DD" (day), "YYYY-MM" (month), or "all". */
  key: string;
  /** Display label, e.g. "Jun 18" or "Jun 2026". */
  label: string;
  totals: TokenTotals;
}

const emptyTotals = (): TokenTotals => ({ ...EMPTY_TOTALS });

function addInto(t: TokenTotals, r: DailyAggRow): void {
  t.inputTokens += r.inputTokens;
  t.outputTokens += r.outputTokens;
  t.cacheCreationTokens += r.cacheCreationTokens;
  t.cacheReadTokens += r.cacheReadTokens;
  t.totalTokens +=
    r.inputTokens + r.outputTokens + r.cacheCreationTokens + r.cacheReadTokens;
}

/** UTC "YYYY-MM-DD" for a Date. */
export function dayKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** UTC "YYYY-MM" for a Date. */
export function monthKey(d: Date): string {
  return dayKey(d).slice(0, 7);
}

function dayLabel(key: string): string {
  // key = "YYYY-MM-DD"
  const m = Number(key.slice(5, 7)) - 1;
  const d = Number(key.slice(8, 10));
  return `${MONTHS[m] ?? "?"} ${d}`;
}

function monthLabel(key: string, withYear = true): string {
  // key = "YYYY-MM"
  const y = key.slice(0, 4);
  const m = Number(key.slice(5, 7)) - 1;
  return withYear ? `${MONTHS[m] ?? "?"} ${y}` : (MONTHS[m] ?? "?");
}

/** Sum the rows matching `pred` (all rows when omitted). */
export function sumAgg(
  rows: DailyAggRow[],
  pred?: (r: DailyAggRow) => boolean,
): TokenTotals {
  const t = emptyTotals();
  for (const r of rows) if (!pred || pred(r)) addInto(t, r);
  return t;
}

/** Totals for one UTC day key ("YYYY-MM-DD"). */
export function totalsForDay(rows: DailyAggRow[], day: string): TokenTotals {
  return sumAgg(rows, (r) => r.day === day);
}

/** Totals for one UTC month key ("YYYY-MM"). */
export function totalsForMonth(rows: DailyAggRow[], ym: string): TokenTotals {
  return sumAgg(rows, (r) => r.day.startsWith(ym));
}

/** Per-day ledger, newest first. One entry per day that had any activity. */
export function dailyLedger(rows: DailyAggRow[]): UsagePeriod[] {
  const by = new Map<string, TokenTotals>();
  for (const r of rows) {
    let t = by.get(r.day);
    if (!t) by.set(r.day, (t = emptyTotals()));
    addInto(t, r);
  }
  return [...by.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, totals]) => ({ key, label: dayLabel(key), totals }));
}

/** Per-month ledger, newest first. */
export function monthlyLedger(rows: DailyAggRow[]): UsagePeriod[] {
  const by = new Map<string, TokenTotals>();
  for (const r of rows) {
    const ym = r.day.slice(0, 7);
    let t = by.get(ym);
    if (!t) by.set(ym, (t = emptyTotals()));
    addInto(t, r);
  }
  return [...by.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, totals]) => ({ key, label: monthLabel(key), totals }));
}

function floorUtcDay(t: number): number {
  return Math.floor(t / DAY_MS) * DAY_MS;
}

/**
 * Build a dense daily {@link TimelineBucket} series over [start, end] from the
 * aggregate rows, splitting per group and per model so the chart's dimension
 * toggle works exactly like the event-built timelines. Days with no activity
 * are zero-filled.
 */
export function aggToDailyBuckets(
  rows: DailyAggRow[],
  start: Date,
  end: Date,
): TimelineBucket[] {
  const byDay = new Map<string, DailyAggRow[]>();
  for (const r of rows) {
    const arr = byDay.get(r.day);
    if (arr) arr.push(r);
    else byDay.set(r.day, [r]);
  }
  const out: TimelineBucket[] = [];
  for (let t = floorUtcDay(start.getTime()); t <= end.getTime(); t += DAY_MS) {
    const d = new Date(t);
    const key = dayKey(d);
    out.push(fillBucket(d.toISOString(), dayLabel(key), byDay.get(key) ?? []));
  }
  return out;
}

/**
 * Build a dense monthly {@link TimelineBucket} series over [start, end] from the
 * aggregate rows, group/model split, zero-filling empty months. Labels are
 * compact ("Jun 26") for the x-axis.
 */
export function aggToMonthlyBuckets(
  rows: DailyAggRow[],
  start: Date,
  end: Date,
): TimelineBucket[] {
  const byMonth = new Map<string, DailyAggRow[]>();
  for (const r of rows) {
    const ym = r.day.slice(0, 7);
    const arr = byMonth.get(ym);
    if (arr) arr.push(r);
    else byMonth.set(ym, [r]);
  }
  const out: TimelineBucket[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth();
  const ey = end.getUTCFullYear();
  const em = end.getUTCMonth();
  while (y < ey || (y === ey && m <= em)) {
    const ym = `${y}-${String(m + 1).padStart(2, "0")}`;
    const ts = new Date(Date.UTC(y, m, 1)).toISOString();
    const label = `${MONTHS[m]} ${String(y).slice(2)}`;
    out.push(fillBucket(ts, label, byMonth.get(ym) ?? []));
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

/** Assemble one bucket's totals + per-group + per-model breakdown from rows. */
function fillBucket(
  ts: string,
  label: string,
  rows: DailyAggRow[],
): TimelineBucket {
  const totals = emptyTotals();
  const byGroup: Record<string, TokenTotals> = {};
  const byModel: Record<string, TokenTotals> = {};
  for (const r of rows) {
    addInto(totals, r);
    const gk = r.groupId ?? "ungrouped";
    addInto((byGroup[gk] ??= emptyTotals()), r);
    const mk = r.model ?? "unknown";
    addInto((byModel[mk] ??= emptyTotals()), r);
  }
  return { ts, label, totals, byGroup, byModel };
}
