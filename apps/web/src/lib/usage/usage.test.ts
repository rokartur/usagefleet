import { describe, expect, it } from "vitest";
import { foldEvents, foldAndSum, recordTotal } from "./fold";
import { buildSessionBlocks, activeBlock, floorToHourUtc } from "./blocks";
import { pastWindowStarts, weekWindowStart, weeklyTotals } from "./window";
import { pct, limitsForPlan, PLAN_PRESETS } from "./limits";
import { costForTotals, costUsd, priceFor } from "./pricing";
import { modelBreakdown, modelLabel } from "./models";
import { computeDashboardUsage } from "./aggregate";
import type { TokenTotals, UsageRecord } from "./types";

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
const m2 = rec({
  uuid: "u2",
  messageId: "msg_2",
  requestId: "req_2",
  ts: "2026-06-18T10:20:00Z",
  inputTokens: 10,
  outputTokens: 50,
  cacheReadTokens: 1000,
  groupId: "g2",
});
const old = rec({
  uuid: "u0",
  messageId: "msg_0",
  requestId: "req_0",
  ts: "2026-06-10T08:00:00Z",
  inputTokens: 5,
  outputTokens: 5,
  groupId: "g1",
});

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

describe("past windows", () => {
  const FIVE_H = 5 * 60 * 60 * 1000;
  // NOW is 2026-06-18T12:00:00Z; the reported reset sits in the future, so the
  // open window is 10:00–15:00 and the completed ones run backwards from 10:00.
  const starts = pastWindowStarts(new Date("2026-06-18T15:00:00Z"), FIVE_H, NOW, 3);

  it("walks back from the window containing now, newest first", () => {
    expect(starts.map((d) => d.toISOString())).toEqual([
      "2026-06-18T05:00:00.000Z",
      "2026-06-18T00:00:00.000Z",
      "2026-06-17T19:00:00.000Z",
    ]);
  });

  it("takes its phase from the origin, past or future", () => {
    // 06-01T00:00 is exactly 84 strides before NOW, so the open window starts at
    // 12:00 and the last completed one at 07:00 — a different grid than above.
    const [first] = pastWindowStarts(new Date("2026-06-01T00:00:00Z"), FIVE_H, NOW, 1);
    expect(first?.toISOString()).toBe("2026-06-18T07:00:00.000Z");
  });
});

describe("limits", () => {
  it("computes percent", () => {
    expect(pct(32117, 88000)).toBe(36);
    expect(pct(5, 0)).toBe(0);
  });
  it("resolves plan presets", () => {
    expect(limitsForPlan("max5")).toEqual(PLAN_PRESETS.max5);
    expect(limitsForPlan("custom", { sessionLimitTokens: 1, weeklyLimitTokens: 2 })).toEqual({
      sessionLimitTokens: 1,
      weeklyLimitTokens: 2,
    });
  });
});

describe("pricing", () => {
  it("prices per million tokens by model family and version", () => {
    const mtok = (over: Partial<TokenTotals>): TokenTotals => ({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
      ...over,
    });
    // Opus 4.5+ current tier: $5 in / $25 out per MTok.
    expect(costForTotals(mtok({ inputTokens: 1_000_000 }), "claude-opus-4-8")).toBeCloseTo(5);
    expect(costForTotals(mtok({ outputTokens: 1_000_000 }), "claude-opus-4-8")).toBeCloseTo(25);
    // Opus 4.1 legacy tier: $15 in / $75 out per MTok.
    expect(costForTotals(mtok({ inputTokens: 1_000_000 }), "claude-opus-4-1")).toBeCloseTo(15);
    expect(costForTotals(mtok({ outputTokens: 1_000_000 }), "claude-opus-4-1")).toBeCloseTo(75);
    // Haiku 4.5 ($1/$5) vs Haiku 3.5 legacy ($0.80/$4).
    expect(costForTotals(mtok({ inputTokens: 1_000_000 }), "claude-haiku-4-5")).toBeCloseTo(1);
    expect(costForTotals(mtok({ inputTokens: 1_000_000 }), "claude-3-5-haiku")).toBeCloseTo(0.8);
    // Sonnet flat $3 in / $15 out; cache read 0.1x. Cache writes default to the
    // 5m rate (1.25x) because that is what Claude Code writes unless
    // ENABLE_PROMPT_CACHING_1H is set; 1h is 2x.
    expect(costForTotals(mtok({ inputTokens: 1_000_000 }), "claude-sonnet-4-6")).toBeCloseTo(3);
    expect(
      costForTotals(mtok({ cacheCreationTokens: 1_000_000 }), "claude-sonnet-4-6"),
    ).toBeCloseTo(3.75);
    expect(
      costForTotals(mtok({ cacheCreationTokens: 1_000_000 }), "claude-sonnet-4-6", "1h"),
    ).toBeCloseTo(6);
    expect(costForTotals(mtok({ cacheReadTokens: 1_000_000 }), "claude-sonnet-4-6")).toBeCloseTo(
      0.3,
    );
  });
  it("prices fable at the frontier tier ($10/$50, cache 20/1)", () => {
    expect(priceFor("claude-fable-5")).toEqual({
      input: 10,
      output: 50,
      cacheWrite: 20,
      cacheRead: 1,
    });
    expect(
      costUsd(
        rec({
          uuid: "f",
          ts: "2026-06-18T10:00:00Z",
          model: "claude-fable-5",
          outputTokens: 1_000_000,
        }),
      ),
    ).toBeCloseTo(50);
  });
});

describe("model breakdown", () => {
  it("labels model families with a major.minor version", () => {
    expect(modelLabel("claude-opus-4-8-20251101")).toBe("Opus 4.8");
    // Single-number versions and the "[1m]" / dated-snapshot suffixes.
    expect(modelLabel("claude-opus-5")).toBe("Opus 5");
    expect(modelLabel("claude-opus-5[1m]")).toBe("Opus 5");
    expect(modelLabel("claude-opus-5-20260601")).toBe("Opus 5");
    expect(modelLabel("claude-3-5-sonnet-20241022")).toBe("Sonnet 3.5");
    expect(modelLabel("claude-sonnet-4-6")).toBe("Sonnet 4.6");
    expect(modelLabel("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
    expect(modelLabel(null)).toBe("Unknown");
    expect(modelLabel("gpt-4o")).toBe("gpt-4o"); // unknown family → raw id kept
  });

  it("folds streamed segments, groups by model, sorts by billable desc", () => {
    const opus = rec({
      uuid: "o1",
      messageId: "mo",
      requestId: "ro",
      model: "claude-opus-4-8",
      ts: "2026-06-18T10:30:00Z",
      inputTokens: 100,
      outputTokens: 900,
    });
    const mb = modelBreakdown([...m1, m2, opus]);
    // sonnet billable (13558 from folded m1 + 60 from m2) > opus (1000) → first
    expect(mb.map((m) => m.label)).toEqual(["Sonnet 4.6", "Opus 4.8"]);
    const sonnet = mb.find((m) => m.label === "Sonnet 4.6")!;
    expect(sonnet.billableTokens).toBe(13558 + 60);
    expect(sonnet.totals.totalTokens).toBe(31057 + 1060); // folded, not 3x m1
    expect(mb.find((m) => m.label === "Opus 4.8")!.billableTokens).toBe(1000);
  });

  it("drops token-less pseudo-models like <synthetic>", () => {
    const real = rec({
      uuid: "r1",
      model: "claude-opus-4-8",
      ts: "2026-06-18T10:00:00Z",
      outputTokens: 100,
    });
    const synthetic = rec({ uuid: "s1", model: "<synthetic>", ts: "2026-06-18T10:01:00Z" }); // all token buckets 0
    const mb = modelBreakdown([real, synthetic]);
    expect(mb.map((m) => m.label)).toEqual(["Opus 4.8"]); // <synthetic> excluded
  });

  it("buckets events without a model id under 'unknown'", () => {
    const noModel = rec({
      uuid: "n1",
      ts: "2026-06-18T10:00:00Z",
      model: null as unknown as string,
      outputTokens: 5,
    });
    const mb = modelBreakdown([noModel]);
    expect(mb).toHaveLength(1);
    expect(mb[0].model).toBe("unknown");
    expect(mb[0].label).toBe("Unknown");
  });
});

describe("dashboard aggregate", () => {
  const cfg = {
    sessionLimitTokens: 88_000,
    weeklyLimitTokens: 2_200_000,
    weekResetWeekday: 1,
    weekResetHourUtc: 0,
  };
  const groups = [
    { id: "g1", name: "Laptops", color: "#111" },
    { id: "g2", name: "Desktops", color: "#222" },
  ];

  it("attaches a per-group model breakdown over the weekly window", () => {
    const dash = computeDashboardUsage([...m1, m2, old], groups, cfg, NOW);
    const g1 = dash.groups.find((g) => g.groupId === "g1")!;
    // `old` (06-10) precedes weekStart (06-15) → excluded; only m1 (sonnet) remains.
    expect(g1.models.map((m) => m.label)).toEqual(["Sonnet 4.6"]);
    expect(g1.models[0].totals.totalTokens).toBe(31057);
    const g2 = dash.groups.find((g) => g.groupId === "g2")!;
    expect(g2.models.map((m) => m.label)).toEqual(["Sonnet 4.6"]);
  });

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
