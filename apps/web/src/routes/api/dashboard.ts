import { createFileRoute } from "@tanstack/react-router";
import { getLiveDashboard, toDashboardDTO } from "@/lib/data";
import { getSession } from "@/lib/session";

/** Live dashboard data for the signed-in user (polled by the client). */
async function GET() {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const dash = await getLiveDashboard(session.user.id, new Date());
  return Response.json(toDashboardDTO(dash), {
    headers: { "cache-control": "no-store" },
  });
}

export const Route = createFileRoute("/api/dashboard")({
  server: {
    handlers: {
      GET: () => GET(),
    },
  },
});
