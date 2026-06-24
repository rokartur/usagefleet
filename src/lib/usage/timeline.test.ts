import { describe, expect, it } from "vitest";
import { buildDailyTimeline, buildHourlyTimeline, buildTimeline } from "./timeline";
import type { UsageRecord } from "./types";

function rec(
  p: Partial<UsageRecord> & { uuid: string; ts: string },
): UsageRecord {
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
  rec({ uuid: "u1a", messageId: "msg_1", requestId: "req_1", ts: "2026-06-18T10:15:00Z", inputTokens: 6, outputTokens: 100, cacheCreationTokens: 13240, cacheReadTokens: 17499, groupId: "g1" }),
  rec({ uuid: "u1b", messageId: "msg_1", requestId: "req_1", ts: "2026-06-18T10:15:01Z", inputTokens: 6, outputTokens: 200, cacheCreationTokens: 13240, cacheReadTokens: 17499, groupId: "g1" }),
  rec({ uuid: "u1c", messageId: "msg_1", requestId: "req_1", ts: "2026-06-18T10:15:02Z", inputTokens: 6, outputTokens: 312, cacheCreationTokens: 13240, cacheReadTokens: 17499, groupId: "g1" }),
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
    expect(tl.map((b) => b.total)).toEqual([0, 10, 0, 25]);
    expect(tl[1].label).toBe("Jun 16");
  });

  it("folds streamed segments before bucketing (largest, not sum)", () => {
    const tl = buildDailyTimeline(m1, WEEK_START, NOW);
    const day = tl.find((b) => b.ts === "2026-06-18T00:00:00.000Z")!;
    // billable of the largest segment = 6 + 312 + 13240 = 13558 (NOT 3x)
    expect(day.total).toBe(13558);
    expect(day.byGroup.g1).toBe(13558);
  });

  it("counts billable only — excludes cache reads, ignores pure-cache rows", () => {
    const evs = [
      rec({ uuid: "x", ts: "2026-06-17T08:00:00Z", inputTokens: 5, outputTokens: 7, cacheCreationTokens: 3, cacheReadTokens: 99999 }),
      rec({ uuid: "y", ts: "2026-06-17T09:00:00Z", cacheReadTokens: 50000 }), // pure cache read
    ];
    const tl = buildDailyTimeline(evs, WEEK_START, NOW);
    const day = tl.find((b) => b.ts === "2026-06-17T00:00:00.000Z")!;
    expect(day.total).toBe(15); // 5 + 7 + 3, cacheRead excluded
    expect(day.byModel).toEqual({ "claude-sonnet-4-6": 15 }); // pure-cache row adds no key
  });

  it("excludes events outside the window", () => {
    const evs = [
      rec({ uuid: "before", ts: "2026-06-10T08:00:00Z", outputTokens: 100 }),
      rec({ uuid: "in", ts: "2026-06-16T08:00:00Z", outputTokens: 5 }),
      rec({ uuid: "after", ts: "2026-06-20T08:00:00Z", outputTokens: 100 }),
    ];
    const tl = buildDailyTimeline(evs, WEEK_START, NOW);
    expect(tl.reduce((s, b) => s + b.total, 0)).toBe(5);
  });

  it("keys byGroup/byModel correctly and group sums equal the bucket total", () => {
    const evs = [
      rec({ uuid: "a", ts: "2026-06-16T08:00:00Z", outputTokens: 10, groupId: "g1", model: "claude-opus-4-8" }),
      rec({ uuid: "b", ts: "2026-06-16T09:00:00Z", outputTokens: 4, groupId: null, model: "claude-sonnet-4-6" }),
    ];
    const day = buildDailyTimeline(evs, WEEK_START, NOW).find(
      (b) => b.ts === "2026-06-16T00:00:00.000Z",
    )!;
    expect(day.total).toBe(14);
    expect(day.byGroup).toEqual({ g1: 10, ungrouped: 4 });
    expect(day.byModel).toEqual({ "claude-opus-4-8": 10, "claude-sonnet-4-6": 4 });
    const groupSum = Object.values(day.byGroup).reduce((s, n) => s + n, 0);
    expect(groupSum).toBe(day.total);
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
    expect(tl.map((b) => b.total)).toEqual([3, 0, 8]);
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
