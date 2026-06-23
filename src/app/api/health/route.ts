// Liveness/readiness probe for the container healthcheck. Cheap and dependency-
// free so it answers even while the DB is briefly unavailable.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "cache-control": "no-store" } },
  );
}
