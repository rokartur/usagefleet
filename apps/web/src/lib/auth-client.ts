import { stripeClient } from "@better-auth/stripe/client";
import { createAuthClient } from "better-auth/react";

// No baseURL → the client calls the same origin it's served from, so the app
// works on any host/port without rebuilding.
// stripeClient adds authClient.subscription.* (upgrade / billingPortal).
export const authClient = createAuthClient({
  plugins: [stripeClient({ subscription: true })],
});

export const { signIn, signUp, signOut, useSession } = authClient;
