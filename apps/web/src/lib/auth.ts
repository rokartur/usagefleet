import { stripe as stripePlugin } from "@better-auth/stripe";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import Stripe from "stripe";
import { db } from "../db";
import * as schema from "../db/schema";
import { signupEnabled } from "./flags";
import { PAID_PLANS, PLANS } from "./plans";

// better-auth only WARNS on a short secret; enforce it. The secret signs/encrypts
// session data, so a weak one silently weakens session integrity. Vite only
// bundles this module at build time (it never executes it, unlike `next build`),
// so the check can run unconditionally in production.
const secret = process.env.BETTER_AUTH_SECRET;
if (process.env.NODE_ENV === "production" && (!secret || secret.length < 32)) {
  throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters in production");
}

// Billing is mandatory (UsageFleet is hosted, not self-hosted), so a missing
// Stripe variable is a production error.
function billingEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`${name} is not set`);
  return `unset-${name}`;
}

export const auth = betterAuth({
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // disableSignUp blocks the sign-up endpoint server-side (real enforcement,
  // not just UI). Toggle with ALLOW_SIGNUP=false.
  emailAndPassword: { enabled: true, disableSignUp: !signupEnabled() },
  plugins: [
    stripePlugin({
      stripeClient: new Stripe(billingEnv("STRIPE_SECRET_KEY")),
      stripeWebhookSecret: billingEnv("STRIPE_WEBHOOK_SECRET"),
      // A customer up front keeps checkout and the billing portal one call away.
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: PAID_PLANS.map((id) => ({ name: id, priceId: billingEnv(PLANS[id].priceIdEnv) })),
      },
    }),
    // Must be last; forwards better-auth's Set-Cookie through the Start response.
    tanstackStartCookies(),
  ],
});

export type Auth = typeof auth;
