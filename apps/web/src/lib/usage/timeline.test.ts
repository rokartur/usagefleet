import { describe, expect, it } from "vitest";
import { buildDailyTimeline, buildHourlyTimeline, buildTimeline, metricValue } from "./timeline";
import type { UsageRecord } from "./types";

/** Billable shorthand for the new TokenTotals-keyed buckets. */
const bill = (t: {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}) => metricValue(t, "billable");

function rec(p: Partial<UsageRecord> & { uuid: string; ts: string }): UsageRecord {
  return {
    messageId: null,
    requestId: null,
    model: "claude-sonnet-4-6",
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    groupId: null,
    deviceId: null,
    ...p,
    ts: new Date(p.ts),
  };
}

// One logical message streamed across 3 growing segments — must fold to the
// largest BEFORE bucketing (else a single message is counted 3x).
const m1 = [
  rec({
    uuid: "u1a",
    messageId: "msg_1",
    requestId: "req_1",
    ts: "2026-06-18T10:15:00Z",
    inputTokens: 6,
    outputTokens: 100,
    cacheCreationTokens: 13240,
    cacheReadTokens: 17499,
    groupId: "g1",
  }),
  rec({
    uuid: "u1b",
    messageId: "msg_1",
    requestId: "req_1",
    ts: "2026-06-18T10:15:01Z",
    inputTokens: 6,
    outputTokens: 200,
    cacheCreationTokens: 13240,
    cacheReadTokens: 17499,
    groupId: "g1",
  }),
  rec({
    uuid: "u1c",
    messageId: "msg_1",
    requestId: "req_1",
    ts: "2026-06-18T10:15:02Z",
    inputTokens: 6,
    outputTokens: 312,
    cacheCreationTokens: 13240,
    cacheReadTokens: 17499,
    groupId: "g1",
  }),
];

const WEEK_START = new Date("2026-06-15T00:00:00Z");
const NOW = new Date("2026-06-18T12:30:00Z");

describe("timeline — daily", () => {
  it("buckets events into their UTC day, dense and time-ascending", () => {
    const evs = [
      rec({ uuid: "a", ts: "2026-06-16T09:00:00Z", outputTokens: 10 }),
      rec({ uuid: "b", ts: "2026-06-18T11:00:00Z", outputTokens: 25 }),
    ];
    const tl = buildDailyTimeline(evs, WEEK_START, NOW);
    // 06-15, 06-16, 06-17, 06-18 → 4 dense buckets
    expect(tl.map((b) => b.ts)).toEqual([
      "2026-06-15T00:00:00.000Z",
      "2026-06-16T00:00:00.000Z",
      "2026-06-17T00:00:00.000Z",
      "2026-06-18T00:00:00.000Z",
    ]);
    expect(tl.map((b) => bill(b.totals))).toEqual([0, 10, 0, 25]);
    expect(tl[1].label).toBe("Jun 16");
  });

  it("folds streamed segments before bucketing (largest, not sum)", () => {
    const tl = buildDailyTimeline(m1, WEEK_START, NOW);
    const day = tl.find((b) => b.ts === "2026-06-18T00:00:00.000Z")!;
    // billable of the largest segment = 6 + 312 + 13240 = 13558 (NOT 3x)
    expect(bill(day.totals)).toBe(13558);
    expect(bill(day.byGroup.g1)).toBe(13558);
  });

  it("billable metric excludes cache reads; cacheRead/total metrics include them", () => {
    const evs = [
      rec({
        uuid: "x",
        ts: "2026-06-17T08:00:00Z",
        inputTokens: 5,
        outputTokens: 7,
        cacheCreationTokens: 3,
        cacheReadTokens: 99999,
      }),
      rec({ uuid: "y", ts: "2026-06-17T09:00:00Z", cacheReadTokens: 50000 }), // pure cache read
    ];
    const tl = buildDailyTimeline(evs, WEEK_START, NOW);
    const day = tl.find((b) => b.ts === "2026-06-17T00:00:00.000Z")!;
    expect(metricValue(day.totals, "billable")).toBe(15); // 5 + 7 + 3, cacheRead excluded
    expect(metricValue(day.totals, "cacheRead")).toBe(149999); // both rows' cache reads
    expect(metricValue(day.totals, "total")).toBe(150014); // billable + cache reads
    expect(metricValue(day.totals, "input")).toBe(5);
    expect(metricValue(day.totals, "output")).toBe(7);
    // The pure-cache row keeps the same model key — it counts toward cache metrics.
    expect(Object.keys(day.byModel)).toEqual(["claude-sonnet-4-6"]);
    expect(metricValue(day.byModel["claude-sonnet-4-6"], "billable")).toBe(15);
  });

  it("drops truly-empty (<synthetic>) rows with 0 of every token", () => {
    const evs = [
      rec({ uuid: "real", ts: "2026-06-16T08:00:00Z", outputTokens: 9, model: "claude-opus-4-8" }),
      rec({ uuid: "synth", ts: "2026-06-16T09:00:00Z", model: "<synthetic>" }), // all zero
    ];
    const day = buildDailyTimeline(evs, WEEK_START, NOW).find(
      (b) => b.ts === "2026-06-16T00:00:00.000Z",
    )!;
    expect(Object.keys(day.byModel)).toEqual(["claude-opus-4-8"]);
    expect(metricValue(day.totals, "total")).toBe(9);
  });

  it("excludes events outside the window", () => {
    const evs = [
      rec({ uuid: "before", ts: "2026-06-10T08:00:00Z", outputTokens: 100 }),
      rec({ uuid: "in", ts: "2026-06-16T08:00:00Z", outputTokens: 5 }),
      rec({ uuid: "after", ts: "2026-06-20T08:00:00Z", outputTokens: 100 }),
    ];
    const tl = buildDailyTimeline(evs, WEEK_START, NOW);
    expect(tl.reduce((s, b) => s + bill(b.totals), 0)).toBe(5);
  });

  it("keys byGroup/byModel correctly and group sums equal the bucket total", () => {
    const evs = [
      rec({
        uuid: "a",
        ts: "2026-06-16T08:00:00Z",
        outputTokens: 10,
        groupId: "g1",
        model: "claude-opus-4-8",
      }),
      rec({
        uuid: "b",
        ts: "2026-06-16T09:00:00Z",
        outputTokens: 4,
        groupId: null,
        model: "claude-sonnet-4-6",
      }),
    ];
    const day = buildDailyTimeline(evs, WEEK_START, NOW).find(
      (b) => b.ts === "2026-06-16T00:00:00.000Z",
    )!;
    expect(bill(day.totals)).toBe(14);
    expect(bill(day.byGroup.g1)).toBe(10);
    expect(bill(day.byGroup.ungrouped)).toBe(4);
    expect(bill(day.byModel["claude-opus-4-8"])).toBe(10);
    expect(bill(day.byModel["claude-sonnet-4-6"])).toBe(4);
    const groupSum = Object.values(day.byGroup).reduce((s, t) => s + bill(t), 0);
    expect(groupSum).toBe(bill(day.totals));
    // cells carry the full (group × model × source × device) split; absent
    // source/device fall back to "cli"/"unknown" and the cell sum == the total.
    expect(day.cells).toHaveLength(2);
    const g1cell = day.cells.find((c) => c.g === "g1")!;
    expect([g1cell.m, g1cell.s, g1cell.d, bill(g1cell.totals)]).toEqual([
      "claude-opus-4-8",
      "cli",
      "unknown",
      10,
    ]);
    const cellSum = day.cells.reduce((s, c) => s + bill(c.totals), 0);
    expect(cellSum).toBe(bill(day.totals));
  });

  it("is deterministic — identical inputs produce deep-equal output", () => {
    const a = buildDailyTimeline(m1, WEEK_START, NOW);
    const b = buildDailyTimeline(m1, WEEK_START, NOW);
    expect(a).toEqual(b);
  });
});

describe("timeline — hourly", () => {
  it("buckets by UTC hour with HH:00 labels", () => {
    const start = new Date("2026-06-18T10:00:00Z");
    const end = new Date("2026-06-18T12:30:00Z");
    const evs = [
      rec({ uuid: "a", ts: "2026-06-18T10:30:00Z", outputTokens: 3 }),
      rec({ uuid: "b", ts: "2026-06-18T12:05:00Z", outputTokens: 8 }),
    ];
    const tl = buildHourlyTimeline(evs, start, end);
    expect(tl.map((b) => b.label)).toEqual(["10:00", "11:00", "12:00"]);
    expect(tl.map((b) => bill(b.totals))).toEqual([3, 0, 8]);
  });
});

describe("timeline — buildTimeline dispatch", () => {
  it("routes granularity to day/hour bucketing", () => {
    const evs = [rec({ uuid: "a", ts: "2026-06-16T08:00:00Z", outputTokens: 5 })];
    expect(buildTimeline(evs, WEEK_START, NOW, "day")).toHaveLength(4);
    const hStart = new Date("2026-06-16T08:00:00Z");
    const hEnd = new Date("2026-06-16T10:00:00Z");
    expect(buildTimeline(evs, hStart, hEnd, "hour")).toHaveLength(3);
  });
});
