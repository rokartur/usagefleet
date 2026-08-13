import { describe, expect, it } from "vitest";
import { calibrateLimit, type WindowAggRow } from "./data";

const OPEN = 5_000;
const cell = (binStart: number, billable: number): WindowAggRow => ({
  binStart,
  groupId: null,
  totals: {
    inputTokens: billable,
    outputTokens: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalTokens: billable,
  },
});

describe("calibrateLimit", () => {
  const rows = [cell(OPEN, 500_000), cell(4_000, 800_000), cell(3_000, 300_000)];

  it("measures the limit off the open window once its pct carries signal", () => {
    expect(calibrateLimit(rows, OPEN, 50, 88_000)).toBe(1_000_000);
  });

  it("ignores a barely-started window instead of scaling it by 100x", () => {
    // The old behaviour read 500k tokens at 1% as a 50M limit; the busiest
    // window on record (800k) is the honest floor instead.
    expect(calibrateLimit(rows, OPEN, 1, 88_000)).toBe(800_000);
  });

  it("falls back to the plan limit with no usage and no report", () => {
    expect(calibrateLimit([], OPEN, null, 88_000)).toBe(88_000);
  });
});
