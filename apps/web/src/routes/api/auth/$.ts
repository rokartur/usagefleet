import { createFileRoute } from "@tanstack/react-router";
import { auth } from "@/lib/auth";

// Everything better-auth owns: /api/auth/sign-in, /sign-up, /sign-out, the
// Stripe subscription endpoints and /api/auth/stripe/webhook. better-auth
// speaks plain Request/Response, so its handler mounts as-is.
export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});
