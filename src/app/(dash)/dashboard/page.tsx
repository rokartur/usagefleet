import { AutoRefresh } from "@/components/AutoRefresh";
import { LiveDashboard } from "@/components/LiveDashboard";
import { UsageExplorer } from "@/components/dashboard/UsageExplorer";
import { updateCacheTtl } from "@/lib/actions";
import {
  ensureSettings,
  getHistory,
  getLiveDashboard,
  toDashboardDTO,
} from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [initial, history, settings] = await Promise.all([
    getLiveDashboard(user.id, new Date()).then(toDashboardDTO),
    getHistory(user.id),
    ensureSettings(user.id),
  ]);
  return (
    <div className="flex flex-col gap-8">
      {/* The live cards poll on their own; this keeps the history chart fresh. */}
      <AutoRefresh intervalMs={60000} />
      <LiveDashboard initial={initial} />

      {history.rows.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-neutral-400">Usage over time</h2>
          <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
            <UsageExplorer history={history} />
            <p className="mt-4 text-xs text-neutral-500">
              Days are UTC. Cost is estimated at public API list prices, priced
              per model.
            </p>
          </div>
        </section>
      )}

      <form
        action={updateCacheTtl}
        className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-[#0a0a0a] p-5 text-sm"
      >
        <span className="font-medium text-neutral-200">Cache-write TTL</span>
        <select
          name="cacheWriteTtl"
          defaultValue={settings.cacheWriteTtl}
          className="rounded border border-white/10 bg-transparent px-2 py-1 text-neutral-300 [color-scheme:dark]"
        >
          <option value="1h" className="bg-[#0a0a0a]">
            1h (2× input — Claude Code default)
          </option>
          <option value="5m" className="bg-[#0a0a0a]">
            5m (1.25× input)
          </option>
        </select>
        <button
          type="submit"
          className="rounded-md border border-white/15 px-3 py-1 text-neutral-200 hover:border-white/30"
        >
          Save
        </button>
        <span className="text-xs text-neutral-500">
          Rate used to price cache writes in cost estimates and group splits.
        </span>
      </form>
    </div>
  );
}
