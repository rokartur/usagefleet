import { describe, expect, it } from "vitest";
import {
  aggToDailyBuckets,
  aggToMonthlyBuckets,
  type DailyAggRow,
  dailyLedger,
  dayKey,
  groupTotals,
  monthKey,
  monthlyLedger,
  sumAgg,
  totalsForDay,
  totalsForMonth,
} from "./daily-agg";
import { metricValue } from "./timeline";

function row(p: Partial<DailyAggRow> & { day: string }): DailyAggRow {
  return {
    groupId: null,
    model: "claude-sonnet-4-6",
    source: "cli",
    deviceId: "dev1",
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    ...p,
  };
}

const ROWS: DailyAggRow[] = [
  row({ day: "2026-06-24", groupId: "g1", model: "claude-opus-4-8", inputTokens: 10, outputTokens: 5, cacheCreationTokens: 2, cacheReadTokens: 100 }),
  row({ day: "2026-06-24", groupId: "g2", model: "claude-sonnet-4-6", inputTokens: 3, outputTokens: 1, cacheCreationTokens: 0, cacheReadTokens: 40 }),
  row({ day: "2026-06-18", groupId: "g1", model: "claude-opus-4-8", outputTokens: 20, cacheReadTokens: 7 }),
  row({ day: "2026-05-30", groupId: "g1", model: "claude-sonnet-4-6", inputTokens: 8 }),
];

describe("daily-agg — date keys", () => {
  it("formats UTC day/month keys", () => {
    const d = new Date("2026-06-24T23:30:00Z");
    expect(dayKey(d)).toBe("2026-06-24");
    expect(monthKey(d)).toBe("2026-06");
  });
});

describe("daily-agg — sums", () => {
  it("sumAgg totals every component and the grand total", () => {
    const t = sumAgg(ROWS);
    expect(t.inputTokens).toBe(21); // 10 + 3 + 0 + 8
    expect(t.outputTokens).toBe(26); // 5 + 1 + 20
    expect(t.cacheCreationTokens).toBe(2);
    expect(t.cacheReadTokens).toBe(147); // 100 + 40 + 7
    expect(t.totalTokens).toBe(21 + 26 + 2 + 147);
    expect(metricValue(t, "billable")).toBe(21 + 26 + 2);
  });

  it("totalsForDay / totalsForMonth filter by UTC key", () => {
    expect(metricValue(totalsForDay(ROWS, "2026-06-24"), "billable")).toBe(
      10 + 5 + 2 + 3 + 1,
    );
    expect(totalsForDay(ROWS, "2026-06-24").cacheReadTokens).toBe(140);
    // June = 24th (two rows) + 18th
    expect(totalsForMonth(ROWS, "2026-06").outputTokens).toBe(5 + 1 + 20);
    expect(totalsForMonth(ROWS, "2026-05").inputTokens).toBe(8);
  });
});

describe("daily-agg — ledgers", () => {
  it("dailyLedger is one row per day, newest first", () => {
    const l = dailyLedger(ROWS);
    expect(l.map((r) => r.key)).toEqual(["2026-06-24", "2026-06-18", "2026-05-30"]);
    expect(l[0].label).toBe("Jun 24");
    expect(metricValue(l[0].totals, "billable")).toBe(10 + 5 + 2 + 3 + 1);
  });

  it("monthlyLedger rolls days into months, newest first", () => {
    const l = monthlyLedger(ROWS);
    expect(l.map((r) => r.key)).toEqual(["2026-06", "2026-05"]);
    expect(l[0].label).toBe("Jun 2026");
    expect(l[0].totals.outputTokens).toBe(5 + 1 + 20);
    expect(l[1].totals.inputTokens).toBe(8);
  });
});

describe("daily-agg — chart buckets", () => {
  it("aggToDailyBuckets is dense, zero-filling gaps, split by group/model", () => {
    const buckets = aggToDailyBuckets(
      ROWS,
      new Date("2026-06-22T12:00:00Z"),
      new Date("2026-06-24T08:00:00Z"),
    );
    // 06-22, 06-23, 06-24 → 3 dense buckets even though only the 24th has data
    expect(buckets.map((b) => b.label)).toEqual(["Jun 22", "Jun 23", "Jun 24"]);
    expect(metricValue(buckets[0].totals, "total")).toBe(0);
    const last = buckets[2];
    expect(metricValue(last.totals, "billable")).toBe(10 + 5 + 2 + 3 + 1);
    expect(metricValue(last.byGroup.g1, "billable")).toBe(10 + 5 + 2);
    expect(metricValue(last.byGroup.g2, "billable")).toBe(3 + 1);
    expect(metricValue(last.byModel["claude-opus-4-8"], "cacheRead")).toBe(100);
  });

  it("aggToMonthlyBuckets is dense across months with compact labels", () => {
    const buckets = aggToMonthlyBuckets(
      ROWS,
      new Date("2026-05-01T00:00:00Z"),
      new Date("2026-06-24T00:00:00Z"),
    );
    expect(buckets.map((b) => b.label)).toEqual(["May 26", "Jun 26"]);
    expect(metricValue(buckets[0].totals, "billable")).toBe(8);
    // June = 24th rows (10+5+2 + 3+1) + 18th row (output 20)
    expect(metricValue(buckets[1].totals, "billable")).toBe(10 + 5 + 2 + 3 + 1 + 20);
  });

  it("keys absent group/model as ungrouped/unknown", () => {
    const buckets = aggToDailyBuckets(
      [row({ day: "2026-06-24", groupId: null, model: null, source: null, deviceId: null, outputTokens: 4 })],
      new Date("2026-06-24T00:00:00Z"),
      new Date("2026-06-24T12:00:00Z"),
    );
    expect(metricValue(buckets[0].byGroup.ungrouped, "billable")).toBe(4);
    expect(metricValue(buckets[0].byModel.unknown, "billable")).toBe(4);
    // The cell falls back to "cli"/"unknown" for absent source/device.
    const cell = buckets[0].cells[0];
    expect([cell.g, cell.m, cell.s, cell.d]).toEqual(["ungrouped", "unknown", "cli", "unknown"]);
  });

  it("splits cells by source and device within a day", () => {
    const buckets = aggToDailyBuckets(
      [
        row({ day: "2026-06-24", groupId: "g1", source: "cli", deviceId: "dA", outputTokens: 10 }),
        row({ day: "2026-06-24", groupId: "g1", source: "desktop", deviceId: "dB", outputTokens: 4 }),
      ],
      new Date("2026-06-24T00:00:00Z"),
      new Date("2026-06-24T12:00:00Z"),
    );
    const cells = buckets[0].cells;
    expect(cells).toHaveLength(2);
    // byGroup collapses both back into g1.
    expect(metricValue(buckets[0].byGroup.g1, "billable")).toBe(14);
    const cli = cells.find((c) => c.s === "cli")!;
    const desk = cells.find((c) => c.s === "desktop")!;
    expect([cli.d, metricValue(cli.totals, "billable")]).toEqual(["dA", 10]);
    expect([desk.d, metricValue(desk.totals, "billable")]).toEqual(["dB", 4]);
  });
});

describe("daily-agg — groupTotals", () => {
  it("sums per group, keying null as ungrouped, honouring the predicate", () => {
    const all = groupTotals(ROWS);
    expect(metricValue(all.get("g1")!, "billable")).toBe(10 + 5 + 2 + 20 + 8);
    expect(metricValue(all.get("g2")!, "billable")).toBe(3 + 1);
    // Predicate-scoped (one day only).
    const day = groupTotals(ROWS, (r) => r.day === "2026-06-24");
    expect(metricValue(day.get("g1")!, "billable")).toBe(10 + 5 + 2);
    expect(metricValue(day.get("g2")!, "billable")).toBe(3 + 1);
    expect(day.get("g1")!.cacheReadTokens).toBe(100);
  });
});

