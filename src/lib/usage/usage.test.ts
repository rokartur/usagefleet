import { describe, expect, it } from "vitest";
import { foldEvents, foldAndSum, recordTotal } from "./fold";
import {
  buildSessionBlocks,
  activeBlock,
  floorToHourUtc,
} from "./blocks";
import { weekWindowStart, weeklyTotals } from "./window";
import { pct, limitsForPlan, PLAN_PRESETS } from "./limits";
import { costForTotals, costUsd, priceFor } from "./pricing";
import { computeDashboardUsage } from "./aggregate";
import type { UsageRecord } from "./types";

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

// One logical message (msg_1/req_1) streamed across 3 segments with growing
// totals — must collapse to the largest, NOT sum.
const m1 = [
  rec({ uuid: "u1a", messageId: "msg_1", requestId: "req_1", ts: "2026-06-18T10:15:00Z", inputTokens: 6, outputTokens: 100, cacheCreationTokens: 13240, cacheReadTokens: 17499, groupId: "g1" }),
  rec({ uuid: "u1b", messageId: "msg_1", requestId: "req_1", ts: "2026-06-18T10:15:01Z", inputTokens: 6, outputTokens: 200, cacheCreationTokens: 13240, cacheReadTokens: 17499, groupId: "g1" }),
  rec({ uuid: "u1c", messageId: "msg_1", requestId: "req_1", ts: "2026-06-18T10:15:02Z", inputTokens: 6, outputTokens: 312, cacheCreationTokens: 13240, cacheReadTokens: 17499, groupId: "g1" }),
];
const m2 = rec({ uuid: "u2", messageId: "msg_2", requestId: "req_2", ts: "2026-06-18T10:20:00Z", inputTokens: 10, outputTokens: 50, cacheReadTokens: 1000, groupId: "g2" });
const old = rec({ uuid: "u0", messageId: "msg_0", requestId: "req_0", ts: "2026-06-10T08:00:00Z", inputTokens: 5, outputTokens: 5, groupId: "g1" });

const NOW = new Date("2026-06-18T12:30:00Z");

describe("fold", () => {
  it("keeps only the largest segment per (messageId, requestId)", () => {
    const folded = foldEvents(m1);
    expect(folded).toHaveLength(1);
    expect(folded[0].uuid).toBe("u1c");
    expect(recordTotal(folded[0])).toBe(6 + 312 + 13240 + 17499); // 31057
  });

  it("does not overcount when summing streamed segments", () => {
    const totals = foldAndSum([...m1, m2]);
    expect(totals.totalTokens).toBe(31057 + 1060); // 32117, not 3x m1
    expect(totals.outputTokens).toBe(312 + 50);
  });

  it("folds lines without a messageId by uuid", () => {
    const a = rec({ uuid: "x", ts: "2026-06-18T10:00:00Z", outputTokens: 5 });
    const b = rec({ uuid: "y", ts: "2026-06-18T10:00:00Z", outputTokens: 7 });
    expect(foldEvents([a, b])).toHaveLength(2);
  });
});

describe("blocks", () => {
  it("floors to the UTC hour", () => {
    expect(floorToHourUtc(new Date("2026-06-18T10:15:42.500Z")).toISOString()).toBe(
      "2026-06-18T10:00:00.000Z",
    );
  });

  it("splits blocks on a >5h gap and merges within 5h", () => {
    const within = [
      rec({ uuid: "a", ts: "2026-06-18T09:00:00Z", outputTokens: 1 }),
      rec({ uuid: "b", ts: "2026-06-18T11:00:00Z", outputTokens: 1 }),
    ];
    const gapped = [
      rec({ uuid: "a", ts: "2026-06-18T09:00:00Z", outputTokens: 1 }),
      rec({ uuid: "b", ts: "2026-06-18T15:30:00Z", outputTokens: 1 }),
    ];
    const far = new Date("2026-06-19T00:00:00Z");
    expect(buildSessionBlocks(within, far)).toHaveLength(1);
    expect(buildSessionBlocks(gapped, far)).toHaveLength(2);
  });

  it("marks the recent block active and detects its window", () => {
    const blocks = buildSessionBlocks([...m1, m2, old], NOW);
    expect(blocks).toHaveLength(2); // old session + current
    const active = activeBlock([...m1, m2, old], NOW);
    expect(active).not.toBeNull();
    expect(active!.start.toISOString()).toBe("2026-06-18T10:00:00.000Z");
    expect(active!.end.toISOString()).toBe("2026-06-18T15:00:00.000Z");
    expect(active!.totals.totalTokens).toBe(32117);
  });

  it("returns no active block when last activity is >5h old", () => {
    expect(activeBlock(m1, new Date("2026-06-18T20:00:00Z"))).toBeNull();
  });
});

describe("weekly window", () => {
  it("finds the most recent reset (Monday)", () => {
    expect(weekWindowStart(NOW, 1, 0).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
  it("walks back when this week's reset is still in the future (Friday)", () => {
    // NOW is Thursday 06-18; this week's Friday (06-19) is future → previous Friday 06-12
    expect(weekWindowStart(NOW, 5, 0).toISOString()).toBe("2026-06-12T00:00:00.000Z");
  });
  it("excludes events before the window start", () => {
    const { totals } = weeklyTotals([...m1, m2, old], NOW, 1, 0);
    expect(totals.totalTokens).toBe(32117); // `old` (06-10) excluded
  });
});

describe("limits", () => {
  it("computes percent", () => {
    expect(pct(32117, 88000)).toBe(36);
    expect(pct(5, 0)).toBe(0);
  });
  it("resolves plan presets", () => {
    expect(limitsForPlan("max5")).toEqual(PLAN_PRESETS.max5);
    expect(limitsForPlan("custom", { sessionLimitTokens: 1, weeklyLimitTokens: 2 }))
      .toEqual({ sessionLimitTokens: 1, weeklyLimitTokens: 2 });
  });
});

describe("pricing", () => {
  it("prices per million tokens by model family", () => {
    expect(costForTotals({ inputTokens: 1_000_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 1_000_000 }, "claude-opus-4-8")).toBeCloseTo(15);
    expect(costForTotals({ inputTokens: 0, outputTokens: 1_000_000, cacheCreationTokens: 0, cacheReadTokens: 0, totalTokens: 1_000_000 }, "claude-opus-4-8")).toBeCloseTo(75);
  });
  it("skips synthetic fable entries", () => {
    expect(priceFor("claude-fable-5")).toBeNull();
    expect(costUsd(rec({ uuid: "f", ts: "2026-06-18T10:00:00Z", model: "claude-fable-5", outputTokens: 9999 }))).toBe(0);
  });
});

describe("dashboard aggregate", () => {
  const cfg = { sessionLimitTokens: 88_000, weeklyLimitTokens: 2_200_000, weekResetWeekday: 1, weekResetHourUtc: 0 };
  const groups = [
    { id: "g1", name: "Laptops", color: "#111" },
    { id: "g2", name: "Desktops", color: "#222" },
  ];

  it("splits the shared session window across groups", () => {
    const dash = computeDashboardUsage([...m1, m2, old], groups, cfg, NOW);
    expect(dash.overall.session.totalTokens).toBe(32117);
    expect(dash.overall.sessionPct).toBe(36);
    const g1 = dash.groups.find((g) => g.groupId === "g1")!;
    const g2 = dash.groups.find((g) => g.groupId === "g2")!;
    expect(g1.session.totalTokens).toBe(31057); // m1 only (old is outside the 5h window)
    expect(g2.session.totalTokens).toBe(1060);
    // group session shares sum to the overall session total
    expect(g1.session.totalTokens + g2.session.totalTokens).toBe(dash.overall.session.totalTokens);
  });

  it("computes weekly per group and overall", () => {
    const dash = computeDashboardUsage([...m1, m2, old], groups, cfg, NOW);
    expect(dash.overall.weekly.totalTokens).toBe(32117);
    expect(dash.overall.weeklyPct).toBe(1);
    expect(dash.weekStart.toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });
});
