import { describe, expect, it } from "vitest";
import {
  formatPlanPrice,
  FREE_DEVICES,
  isPaidPlan,
  PAID_PLANS,
  PLANS,
  planDevices,
  type PlanPrices,
  planPriceCents,
} from "./plans";

/** Stands in for what lib/stripe-prices.ts reads back from Stripe. */
const PRICES: PlanPrices = { solo: 100, fleet: 300, custom: 35 };

describe("plan catalog", () => {
  it("sells the advertised device caps", () => {
    expect(FREE_DEVICES).toBe(1);
    expect(PLANS.solo.devices).toBe(2);
    expect(PLANS.fleet.devices).toBe(8);
  });

  it("treats unknown or retired plan names as free", () => {
    // A stored subscription can name a plan we no longer sell — it must never
    // resolve to a paid cap by accident.
    expect(isPaidPlan("enterprise")).toBe(false);
    expect(isPaidPlan("toString")).toBe(false);
    for (const id of PAID_PLANS) expect(isPaidPlan(id)).toBe(true);
  });

  it("caps custom plans at the devices actually billed, not the advertised floor", () => {
    expect(planDevices("custom", 25)).toBe(25);
    // Buying under the floor buys fewer devices, never cheaper ones, so the
    // quantity Stripe charged for is allowed to stand on its own.
    expect(planDevices("custom", 3)).toBe(3);
    // Only reachable before the subscription webhook lands.
    expect(planDevices("custom", null)).toBe(PLANS.custom.minDevices);
    // Fixed tiers have no quantity to read, whatever the column happens to say.
    expect(planDevices("fleet", 25)).toBe(PLANS.fleet.devices);
    expect(planDevices("free", 25)).toBe(FREE_DEVICES);
  });

  it("prices custom plans per device without floating point drift", () => {
    expect(planPriceCents("custom", 10, PRICES)).toBe(350);
    expect(planPriceCents("custom", 20, PRICES)).toBe(700); // 20 * 0.35 is 7.000000000000001
    expect(planPriceCents("custom", 11, PRICES)).toBe(385);
    expect(planPriceCents("solo", null, PRICES)).toBe(100);
    expect(planPriceCents("free", null, PRICES)).toBe(0);
  });

  it("shows cents only when the price has any", () => {
    expect(formatPlanPrice(600)).toBe("$6");
    expect(formatPlanPrice(385)).toBe("$3.85");
    expect(formatPlanPrice(35)).toBe("$0.35");
  });
});
