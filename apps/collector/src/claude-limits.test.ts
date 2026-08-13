import { describe, expect, it } from "vitest";
import { parseLimitsHeaders, parseOauthUsage, parsePct, parseReset } from "./claude-limits.js";

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
    const r = parseLimitsHeaders("sub", (n) => headers[n] ?? null, Object.keys(headers));
    expect(r).toEqual({
      source: "sub",
      fiveHourPct: 42,
      sevenDayPct: 73,
      fiveHourResetsAt: "2026-06-18T04:00:00.000Z",
      sevenDayResetsAt: "2026-06-22T00:00:00.000Z",
      modelLimits: [],
    });
  });

  it("collects per-model limits from dynamic header names", () => {
    const headers: Record<string, string> = {
      "anthropic-ratelimit-unified-7d-utilization": "73",
      "anthropic-ratelimit-unified-7d-reset": "2026-06-22T00:00:00Z",
      "anthropic-ratelimit-unified-7d-fable-utilization": "23",
      "anthropic-ratelimit-unified-7d-fable-reset": "2026-07-04T00:59:00Z",
      "anthropic-ratelimit-unified-5h-opus-utilization": "0.5",
      // requests-per-minute style headers must NOT match the model pattern
      "anthropic-ratelimit-requests-limit": "50",
    };
    const r = parseLimitsHeaders("sub", (n) => headers[n] ?? null, Object.keys(headers));
    expect(r.modelLimits).toEqual([
      {
        model: "fable",
        window: "7d",
        pct: 23,
        resetsAt: "2026-07-04T00:59:00.000Z",
      },
      { model: "opus", window: "5h", pct: 50, resetsAt: null },
    ]);
  });

  it("keeps working without a names iterable (no model limits)", () => {
    const r = parseLimitsHeaders("api", () => null);
    expect(r.modelLimits).toEqual([]);
  });
});

describe("parseOauthUsage", () => {
  it("extracts model-scoped entries from limits[] (real payload shape)", () => {
    const body = {
      five_hour: { utilization: 4, resets_at: "2026-07-02T16:29:59+00:00" },
      seven_day: { utilization: 14, resets_at: "2026-07-03T23:59:59+00:00" },
      seven_day_opus: null,
      limits: [
        {
          kind: "session",
          group: "session",
          percent: 4,
          resets_at: "2026-07-02T16:29:59+00:00",
          scope: null,
          is_active: false,
        },
        {
          kind: "weekly_all",
          group: "weekly",
          percent: 14,
          resets_at: "2026-07-03T23:59:59+00:00",
          scope: null,
          is_active: false,
        },
        {
          kind: "weekly_scoped",
          group: "weekly",
          percent: 25,
          resets_at: "2026-07-03T23:59:59+00:00",
          scope: { model: { id: null, display_name: "Fable" }, surface: null },
          is_active: true,
        },
      ],
    };
    expect(parseOauthUsage(body)).toEqual([
      {
        model: "fable",
        window: "7d",
        pct: 25,
        resetsAt: "2026-07-03T23:59:59.000Z",
      },
    ]);
  });

  it("falls back to legacy top-level seven_day_<model> objects", () => {
    const body = {
      seven_day_opus: { utilization: 61, resets_at: "2026-07-03T23:59:59Z" },
      seven_day_sonnet: null,
    };
    expect(parseOauthUsage(body)).toEqual([
      {
        model: "opus",
        window: "7d",
        pct: 61,
        resetsAt: "2026-07-03T23:59:59.000Z",
      },
    ]);
  });

  it("returns [] for junk", () => {
    expect(parseOauthUsage(null)).toEqual([]);
    expect(parseOauthUsage("x")).toEqual([]);
    expect(parseOauthUsage({ limits: "nope" })).toEqual([]);
  });
});
