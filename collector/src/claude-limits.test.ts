import { describe, expect, it } from "vitest";
import { parseLimitsHeaders, parsePct, parseReset } from "./claude-limits.js";

describe("parsePct", () => {
  it("reads a percent header", () => {
    expect(parsePct("37")).toBe(37);
    expect(parsePct("0")).toBe(0);
  });
  it("normalizes a fraction", () => {
    expect(parsePct("0.5")).toBe(50);
  });
  it("returns null for missing/invalid", () => {
    expect(parsePct(null)).toBeNull();
    expect(parsePct("")).toBeNull();
    expect(parsePct("abc")).toBeNull();
  });
});

describe("parseReset", () => {
  it("parses unix seconds", () => {
    expect(parseReset("1781827200")).toBe(new Date(1781827200 * 1000).toISOString());
  });
  it("passes through ISO", () => {
    expect(parseReset("2026-06-18T04:00:00Z")).toBe("2026-06-18T04:00:00.000Z");
  });
  it("returns null for empty", () => {
    expect(parseReset(null)).toBeNull();
  });
});

describe("parseLimitsHeaders", () => {
  it("maps the unified rate-limit headers", () => {
    const headers: Record<string, string> = {
      "anthropic-ratelimit-unified-5h-utilization": "42",
      "anthropic-ratelimit-unified-5h-reset": "2026-06-18T04:00:00Z",
      "anthropic-ratelimit-unified-7d-utilization": "73",
      "anthropic-ratelimit-unified-7d-reset": "2026-06-22T00:00:00Z",
    };
    const r = parseLimitsHeaders("sub", (n) => headers[n] ?? null);
    expect(r).toEqual({
      source: "sub",
      fiveHourPct: 42,
      sevenDayPct: 73,
      fiveHourResetsAt: "2026-06-18T04:00:00.000Z",
      sevenDayResetsAt: "2026-06-22T00:00:00.000Z",
    });
  });
});
