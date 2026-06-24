import { formatTokens } from "@/lib/format";
import type { ModelUsage } from "@/lib/usage";

/** Per-model token table shown when a group or device row is expanded. Columns:
 *  the weekly-window "billable" total (input + output + cache-creation — the
 *  measure that drives the share split) plus the raw input / output / cache
 *  split for precision. */
export function ModelBreakdown({ models }: { models: ModelUsage[] }) {
  if (models.length === 0) {
    return (
      <p className="px-2 text-xs text-neutral-500">
        No model activity in the weekly window yet.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wide text-neutral-600">
          <th className="px-2 pb-1.5 font-medium">Model · weekly</th>
          <th className="px-2 pb-1.5 text-right font-medium">Billable</th>
          <th className="px-2 pb-1.5 text-right font-medium">In</th>
          <th className="px-2 pb-1.5 text-right font-medium">Out</th>
          <th className="px-2 pb-1.5 text-right font-medium">Cache</th>
        </tr>
      </thead>
      <tbody>
        {models.map((m) => (
          <tr key={m.model} className="border-t border-white/5">
            <td className="px-2 py-1.5 font-medium text-neutral-200">{m.label}</td>
            <td className="px-2 py-1.5 text-right tabular-nums text-neutral-300">
              {formatTokens(m.billableTokens)}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">
              {formatTokens(m.totals.inputTokens)}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">
              {formatTokens(m.totals.outputTokens)}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">
              {formatTokens(
                m.totals.cacheCreationTokens + m.totals.cacheReadTokens,
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
