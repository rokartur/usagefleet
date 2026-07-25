import { afterEach, describe, expect, it, vi } from "vitest";

const PAYLOAD = {
  "claude-sonnet-5": {
    litellm_provider: "anthropic",
    input_cost_per_token: 2e-6,
    output_cost_per_token: 1e-5,
    cache_creation_input_token_cost: 2.5e-6, // 5m rate — must NOT be used as cacheWrite
    cache_creation_input_token_cost_above_1hr: 4e-6,
    cache_read_input_token_cost: 2e-7,
  },
  "claude-fable-5": {
    litellm_provider: "anthropic",
    input_cost_per_token: 1e-5,
    output_cost_per_token: 5e-5,
  },
  "gpt-whatever": {
    litellm_provider: "openai",
    input_cost_per_token: 1,
    output_cost_per_token: 1,
  },
};

/** Fresh module instance so the once-a-day fetch guard doesn't leak between tests. */
async function freshPricing() {
  vi.resetModules();
  return import("./pricing");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pricing — fetched price list", () => {
  it("prices from the fetched map, keeps the hardcoded tier for unlisted ids", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify(PAYLOAD)));
    const { priceFor, refreshPrices } = await freshPricing();
    await refreshPrices();

    // Fetched values win — Sonnet 5 intro pricing, not the 3/15 Sonnet tier.
    const s5 = priceFor("claude-sonnet-5");
    expect(s5?.input).toBeCloseTo(2);
    expect(s5?.output).toBeCloseTo(10);
    expect(s5?.cacheWrite).toBeCloseTo(4); // the 1h rate, not the 5m one
    expect(s5?.cacheRead).toBeCloseTo(0.2);
    // Suffixed variants and dated snapshots resolve to the same base id.
    expect(priceFor("claude-sonnet-5[1m]")?.input).toBe(2);
    expect(priceFor("claude-sonnet-5-20260601")?.input).toBe(2);
    // Missing cache rates are derived from input (2x for the 1h write / 0.1x read).
    const f5 = priceFor("claude-fable-5");
    expect(f5?.input).toBeCloseTo(10);
    expect(f5?.cacheWrite).toBeCloseTo(20);
    expect(f5?.cacheRead).toBeCloseTo(1);
    // Unlisted id → hardcoded Sonnet tier.
    expect(priceFor("claude-sonnet-4-6")?.input).toBe(3);
    // Non-Anthropic entries are ignored, so an unknown model can't inherit them.
    expect(priceFor(null)?.input).toBe(3);
  });

  it("falls back to the hardcoded tiers when the fetch fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    const { priceFor, refreshPrices } = await freshPricing();
    await expect(refreshPrices()).resolves.toBeUndefined();

    expect(priceFor("claude-opus-4-8")?.input).toBe(5);
    expect(priceFor("claude-sonnet-5")?.input).toBe(3);
  });
});
