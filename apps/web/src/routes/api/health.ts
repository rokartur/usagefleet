import { createFileRoute } from "@tanstack/react-router";
// Liveness/readiness probe for the container healthcheck. Cheap and dependency-
// free so it answers even while the DB is briefly unavailable.

function GET() {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => GET(),
    },
  },
});
