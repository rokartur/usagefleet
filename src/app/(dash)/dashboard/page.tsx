import { LiveDashboard } from "@/components/LiveDashboard";
import { updateCacheTtl } from "@/lib/actions";
import { ensureSettings, getLiveDashboard, toDashboardDTO } from "@/lib/data";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const [initial, settings] = await Promise.all([
    getLiveDashboard(user.id, new Date()).then(toDashboardDTO),
    ensureSettings(user.id),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <LiveDashboard initial={initial} />
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
