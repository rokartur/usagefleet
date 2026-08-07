import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveDashboard } from "@/components/LiveDashboard";
import { UsageExplorer } from "@/components/dashboard/UsageExplorer";
import { getHistory, getLiveDashboard, toDashboardDTO } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [initial, history] = await Promise.all([
    getLiveDashboard(user.id, new Date()).then(toDashboardDTO),
    getHistory(user.id),
  ]);
  return (
    <>
      {/* The live cards poll on their own; this keeps the history chart fresh. */}
      <AutoRefresh intervalMs={60000} />
      <LiveDashboard initial={initial} />
      {history.rows.length > 0 && <UsageExplorer history={history} />}
    </>
  );
}
