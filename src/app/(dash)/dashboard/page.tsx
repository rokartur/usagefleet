import { LiveDashboard } from "@/components/LiveDashboard";
import { getLiveDashboard, toDashboardDTO } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const initial = toDashboardDTO(await getLiveDashboard(user.id, new Date()));
  return <LiveDashboard initial={initial} />;
}
