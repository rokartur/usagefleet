import { formatTokens } from "@/lib/format";
import type { ModelUsage } from "@/lib/usage";

/** Per-model token breakdown shown when a group or device row is expanded.
 *  Tokens are the weekly-window figures; "billable" = input + output +
 *  cache-creation (the same measure that drives the share split), with the raw
 *  input/output/cache split shown for precision. */
export function ModelBreakdown({ models }: { models: ModelUsage[] }) {
  if (models.length === 0) {
    return (
      <p className="px-2 text-xs text-neutral-500">
        No model activity in the weekly window yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-neutral-600">
        Models · weekly · billable tokens
      </p>
      {models.map((m) => (
        <div
          key={m.model}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded px-2 py-1.5 hover:bg-white/[0.02]"
        >
          <span className="font-medium text-neutral-200">{m.label}</span>
          <span className="tabular-nums text-neutral-400">
            {formatTokens(m.billableTokens)}
            <span className="ml-2 text-xs text-neutral-600">
              in {formatTokens(m.totals.inputTokens)} · out{" "}
              {formatTokens(m.totals.outputTokens)} · cache{" "}
              {formatTokens(
                m.totals.cacheCreationTokens + m.totals.cacheReadTokens,
              )}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
