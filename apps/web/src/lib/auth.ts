import { stripe as stripePlugin } from "@better-auth/stripe";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import Stripe from "stripe";
import { db } from "../db";
import * as schema from "../db/schema";
import { accountPlan } from "./billing";
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

// Mandatory on any deployment, hosted or self-hosted: OAuth because there is no
// password path left to fall back on, Stripe because the upgrade flow reaches it
// from the free tier. A missing variable is a production error, not a warning.
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error(`${name} is not set`);
  return `unset-${name}`;
}

/** One client for the whole server: better-auth drives subscriptions with it,
 *  lib/stripe-prices.ts reads the price list from it. */
export const stripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));

export const auth = betterAuth({
  secret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // GitHub and Google are the only ways in — there is no password path.
  // disableSignUp rejects unknown users server-side (real enforcement, not just
  // UI), so ALLOW_SIGNUP=false has to be set on every provider, not one.
  // Signing in with the second provider links onto the existing account only if
  // BOTH emails are verified: the incoming provider must report the address
  // verified (neither provider here is in trustedProviders), and the existing
  // row must have emailVerified set, because requireLocalEmailVerified defaults
  // to true. Anything else gets account_not_linked, which login.tsx explains.
  // That second condition is also why accounts from the password-only era need
  // drizzle/0013_link_legacy_logins.sql: it never ran a verification step, so
  // those rows would fail the check and could never link a provider.

  // Last resort for failures that arrive with no callback URL to return to (an
  // expired OAuth state cookie, a hand-typed endpoint). Without it better-auth
  // serves its own bare /api/auth/error page; /login at least reads ?error=.
  onAPIError: { errorURL: "/login" },
  socialProviders: {
    github: {
      clientId: requiredEnv("GITHUB_CLIENT_ID"),
      clientSecret: requiredEnv("GITHUB_CLIENT_SECRET"),
      disableSignUp: !signupEnabled(),
    },
    google: {
      clientId: requiredEnv("GOOGLE_CLIENT_ID"),
      clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      disableSignUp: !signupEnabled(),
    },
  },
  user: {
    deleteUser: {
      enabled: true,
      // Removing the user row cascades to devices, groups, usage and the local
      // subscription row, but nothing here can cancel the subscription in
      // Stripe — so deleting mid-plan would keep charging a card for an account
      // that no longer exists. Refuse instead, and let billing.tsx cancel first.
      // This lives in the hook rather than the settings UI because /delete-user
      // is reachable directly with any valid session.
      beforeDelete: async (user) => {
        const { plan } = await accountPlan(user.id);
        if (plan !== "free") {
          throw new APIError("BAD_REQUEST", {
            message: "Cancel your subscription before deleting your account.",
          });
        }
      },
    },
  },
  plugins: [
    stripePlugin({
      stripeClient: stripe,
      stripeWebhookSecret: requiredEnv("STRIPE_WEBHOOK_SECRET"),
      // A customer up front keeps checkout and the billing portal one call away.
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        plans: PAID_PLANS.map((id) => ({ name: id, priceId: requiredEnv(PLANS[id].priceIdEnv) })),
      },
    }),
    // Must be last; forwards better-auth's Set-Cookie through the Start response.
    tanstackStartCookies(),
  ],
});

export type Auth = typeof auth;
