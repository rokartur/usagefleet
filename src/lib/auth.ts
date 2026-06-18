import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "../db";
import * as schema from "../db/schema";
import { signupEnabled } from "./flags";

export const auth = betterAuth({
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
