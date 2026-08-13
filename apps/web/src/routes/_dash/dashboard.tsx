import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AutoRefresh } from "@/components/AutoRefresh";
import { UsageExplorer } from "@/components/dashboard/UsageExplorer";
import { WindowHistory } from "@/components/dashboard/WindowHistory";
import { LiveDashboard } from "@/components/LiveDashboard";
import { getHistory, getLiveDashboard, getWindowHistory, toDashboardDTO } from "@/lib/data";
import { requireUser } from "@/lib/session";

const dashboardData = createServerFn().handler(async () => {
  const user = await requireUser();
  const now = new Date();
  const [initial, history, windows] = await Promise.all([
    getLiveDashboard(user.id, now).then(toDashboardDTO),
    getHistory(user.id),
    getWindowHistory(user.id, now),
  ]);
  return { initial, history, windows };
});

export const Route = createFileRoute("/_dash/dashboard")({
  loader: () => dashboardData(),
  component: DashboardPage,
});

function DashboardPage() {
  const { initial, history, windows } = Route.useLoaderData();
  return (
    <>
      {/* The live cards poll on their own; this keeps the history chart fresh. */}
      <AutoRefresh intervalMs={60000} />
      <LiveDashboard initial={initial} />
      <WindowHistory history={windows} />
      {history.rows.length > 0 && <UsageExplorer history={history} />}
    </>
  );
}
