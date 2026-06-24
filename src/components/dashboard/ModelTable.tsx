import { UsageBar } from "@/components/usage-ui";
import { formatTokens } from "@/lib/format";
import type { ModelUsage } from "@/lib/usage";
import { EmptyState } from "./EmptyState";

/** Account-wide per-model breakdown over the weekly window. Leaf rows (no
 *  expansion) — model is the finest grain. Share = this model's billable tokens
 *  as a fraction of all billable tokens. */
export function ModelTable({ models }: { models: ModelUsage[] }) {
  if (models.length === 0) {
    return <EmptyState>No model activity in the weekly window yet.</EmptyState>;
  }
  const totalBillable = models.reduce((s, m) => s + m.billableTokens, 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <th className="pb-2 font-medium">Model</th>
          <th className="pb-2 font-medium">Billable</th>
          <th className="hidden pb-2 font-medium sm:table-cell">In</th>
          <th className="hidden pb-2 font-medium sm:table-cell">Out</th>
          <th className="hidden pb-2 font-medium sm:table-cell">Cache</th>
          <th className="pb-2 font-medium">Share</th>
        </tr>
      </thead>
      <tbody>
        {models.map((m) => {
          const share =
            totalBillable > 0
              ? Math.round((m.billableTokens / totalBillable) * 100)
              : 0;
          return (
            <tr key={m.model} className="border-t border-white/10">
              <td className="py-3 font-medium text-neutral-200">{m.label}</td>
              <td className="py-3 tabular-nums text-neutral-300">
                {formatTokens(m.billableTokens)}
              </td>
              <td className="hidden py-3 tabular-nums text-neutral-500 sm:table-cell">
                {formatTokens(m.totals.inputTokens)}
              </td>
              <td className="hidden py-3 tabular-nums text-neutral-500 sm:table-cell">
                {formatTokens(m.totals.outputTokens)}
              </td>
              <td className="hidden py-3 tabular-nums text-neutral-500 sm:table-cell">
                {formatTokens(
                  m.totals.cacheCreationTokens + m.totals.cacheReadTokens,
                )}
              </td>
              <td className="py-3 pl-2">
                <div className="flex items-center gap-3">
                  <div className="w-24">
                    <UsageBar pct={share} />
                  </div>
                  <span className="tabular-nums text-neutral-400">{share}%</span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
