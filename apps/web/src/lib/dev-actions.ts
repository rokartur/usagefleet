import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { subscription } from "@/db/schema";
import { isPaidPlan } from "@/lib/plans";
import { requireUser } from "@/lib/session";

/** Writes the subscription row the Stripe webhook would normally write, so plan
 *  gates and device caps can be exercised without a card.
 *
 *  This hands out entitlement for free, so it is refused outside development —
 *  the UI that calls it is compiled out of production builds, but that is a
 *  bundling detail, not a boundary. This check is the boundary.
 *
 *  Clearing is local only: it does not cancel anything at Stripe, so a real test
 *  subscription will reappear on its next webhook. */
export const devSetPlan = createServerFn({ method: "POST" })
  .inputValidator((formData: FormData) => formData)
  .handler(async ({ data: formData }) => {
    if (process.env.NODE_ENV === "production") {
      throw new Error("dev tools are not available in production");
    }
    const user = await requireUser();
    const plan = String(formData.get("plan"));

    // `accountPlan` picks the newest entitling row, so replace rather than add —
    // leftover rows make the resulting cap depend on period end dates.
    await db.delete(subscription).where(eq(subscription.referenceId, user.id));
    if (!isPaidPlan(plan)) return;

    // Only the custom plan reads seats; 0 is allowed on purpose, it is the
    // quickest way to see what a device does once it falls outside the plan.
    const devices = Math.max(0, Math.trunc(Number(formData.get("devices"))) || 0);
    const now = Date.now();
    await db.insert(subscription).values({
      id: randomUUID(),
      plan,
      referenceId: user.id,
      status: "active",
      periodStart: new Date(now),
      periodEnd: new Date(now + 30 * 24 * 60 * 60 * 1000),
      seats: plan === "custom" ? devices : null,
    });
  });
