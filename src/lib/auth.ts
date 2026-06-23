import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "../db";
import * as schema from "../db/schema";
import { signupEnabled } from "./flags";

// better-auth only WARNS on a short secret; enforce it. The secret signs/encrypts
// session data, so a weak one silently weakens session integrity. Don't throw
// during `next build`'s page-data collection (no real secret is present then),
// matching the guard in src/db/index.ts.
const secret = process.env.BETTER_AUTH_SECRET;
if (
  process.env.NODE_ENV === "production" &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  (!secret || secret.length < 32)
) {
  throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters in production");
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
  // nextCookies must be last; sets auth cookies from Server Actions.
  plugins: [nextCookies()],
});

export type Auth = typeof auth;
