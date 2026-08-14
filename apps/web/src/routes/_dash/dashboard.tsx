import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { AutoRefresh } from "@/components/AutoRefresh";
import { UsageExplorer } from "@/components/dashboard/UsageExplorer";
import { WindowHistory } from "@/components/dashboard/WindowHistory";
import { LiveDashboard } from "@/components/LiveDashboard";
import {
  getHistory,
  getLiveDashboard,
  getWindowHistory,
  listDevices,
  toDashboardDTO,
} from "@/lib/data";
import { requireUser } from "@/lib/session";

const dashboardData = createServerFn().handler(async () => {
  const user = await requireUser();
  const now = new Date();
  const [initial, history, windows] = await Promise.all([
    getLiveDashboard(user.id, now).then(toDashboardDTO),
    getHistory(user.id),
    getWindowHistory(user.id, now),
  ]);
  // Only the never-reported account sees the setup rail, so this extra query
  // costs nothing once data is flowing.
  const setup = initial.connected ? null : await setupState(user.id);
  return { initial, history, windows, setup };
});

/** Newest active device (the one just added, usually) and whether any device
 *  has ever reached the API — the two facts the setup rail branches on. */
async function setupState(userId: string) {
  const active = (await listDevices(userId)).filter((d) => !d.revoked);
  return {
    deviceName: active[0]?.name ?? null,
    reportedEver: active.some((d) => d.lastSeenAt !== null),
  };
}

export const Route = createFileRoute("/_dash/dashboard")({
  loader: () => dashboardData(),
  component: DashboardPage,
});

function DashboardPage() {
  const { initial, history, windows, setup } = Route.useLoaderData();
  return (
    <>
      {/* The live cards poll on their own; this keeps the history chart fresh. */}
      <AutoRefresh intervalMs={60000} />
      <LiveDashboard initial={initial} setup={setup} />
      {/* Both of these show up once there is something in them; an account with
          no reports yet gets the setup rail alone. */}
      {(windows.sessions.length > 0 || windows.weeks.length > 0) && (
        <WindowHistory history={windows} />
      )}
      {history.rows.length > 0 && <UsageExplorer history={history} />}
    </>
  );
}
