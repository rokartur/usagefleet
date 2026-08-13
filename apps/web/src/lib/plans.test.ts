import { describe, expect, it } from "vitest";
import { FREE_DEVICES, isPaidPlan, PAID_PLANS, PLANS } from "./plans";

describe("plan catalog", () => {
  it("sells the advertised device caps", () => {
    expect(FREE_DEVICES).toBe(1);
    expect(PLANS.solo).toMatchObject({ devices: 2, priceUsd: 1 });
    expect(PLANS.fleet).toMatchObject({ devices: 8, priceUsd: 3 });
  });

  it("treats unknown or retired plan names as free", () => {
    // A stored subscription can name a plan we no longer sell — it must never
    // resolve to a paid cap by accident.
    expect(isPaidPlan("enterprise")).toBe(false);
    expect(isPaidPlan("toString")).toBe(false);
    for (const id of PAID_PLANS) expect(isPaidPlan(id)).toBe(true);
  });
});
