import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveDashboard } from "@/components/LiveDashboard";
import { UsageExplorer } from "@/components/dashboard/UsageExplorer";
import { WindowHistory } from "@/components/dashboard/WindowHistory";
import { getHistory, getLiveDashboard, getWindowHistory, toDashboardDTO } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const [initial, history, windows] = await Promise.all([
    getLiveDashboard(user.id, now).then(toDashboardDTO),
    getHistory(user.id),
    getWindowHistory(user.id, now),
  ]);
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
