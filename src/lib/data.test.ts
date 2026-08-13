import { describe, expect, it } from "vitest";
import { buildPastWindows, type WindowAggRow } from "./data";

const STRIDE = 5 * 60 * 60 * 1000;
const START = new Date("2026-06-18T10:00:00Z");

const cell = (groupId: string | null, model: string, billable: number): WindowAggRow => ({
  binStart: START.getTime(),
  groupId,
  model,
  totals: {
    inputTokens: billable,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: billable,
  },
});

const label = (id: string | null) => ({ name: id ?? "Ungrouped", color: "#fff" });
const build = (rows: WindowAggRow[], peaks: Map<number, number>) =>
  buildPastWindows(rows, [START], STRIDE, peaks, 2, "1h", label);

describe("buildPastWindows", () => {
  it("splits the window's reported utilization by cost share, scaled to the budget slice", () => {
    // Same token count, but opus costs 5x sonnet — so it eats 5/6 of the 60%.
    const [w] = build(
      [cell("a", "claude-opus-4", 1_000_000), cell("b", "claude-sonnet-4", 1_000_000)],
      new Map([[START.getTime(), 60]]),
    );
    expect(w.accountPct).toBe(60);
    // 60% × 5/6 × 2 groups = 100%, i.e. group a ate the whole account slice.
    expect(w.groups).toEqual([
      { groupId: "a", name: "a", color: "#fff", budgetPct: 100, tokens: 1_000_000 },
      { groupId: "b", name: "b", color: "#fff", budgetPct: 20, tokens: 1_000_000 },
    ]);
  });

  it("reports tokens without a percentage when no sample covers the window", () => {
    const [w] = build([cell("a", "claude-sonnet-4", 500_000)], new Map());
    expect(w.accountPct).toBeNull();
    expect(w.groups[0]).toMatchObject({ budgetPct: null, tokens: 500_000 });
  });

  it("drops windows with no activity", () => {
    expect(build([], new Map([[START.getTime(), 40]]))).toEqual([]);
  });
});
