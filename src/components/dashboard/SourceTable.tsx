import { Fragment } from "react";
import { UsageBar } from "@/components/usage-ui";
import { formatTokens } from "@/lib/format";
import type { LiveSourceUsage } from "@/lib/data";
import { EmptyState } from "./EmptyState";
import { ModelBreakdown } from "./ModelBreakdown";

/** Per-source breakdown table: Claude Code vs Claude Desktop. Rows expand to each
 *  source's per-model token breakdown. Keys are namespaced `src:<source>` so they
 *  coexist with group/device keys in the shared `expanded` Set. */
export function SourceTable({
  sources,
  expanded,
  onToggle,
}: {
  sources: LiveSourceUsage[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (sources.length === 0) {
    return (
      <EmptyState>No usage reported from any Claude app in the current windows yet.</EmptyState>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <th className="pb-2 font-medium">Source</th>
          <th className="pb-2 font-medium">Session</th>
          <th className="pb-2 font-medium">Weekly</th>
        </tr>
      </thead>
      <tbody>
        {sources.map((s) => {
          const key = `src:${s.source}`;
          const isOpen = expanded.has(key);
          return (
            <Fragment key={key}>
              <tr className="border-t border-white/10">
                <td className="py-3 pr-6">
                  <button
                    type="button"
                    onClick={() => onToggle(key)}
                    aria-expanded={isOpen}
                    className="flex items-center gap-2 text-left hover:text-white"
                  >
                    <span
                      className={`text-[10px] text-neutral-500 transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                      aria-hidden
                    >
                      ▶
                    </span>
                    <span className="font-medium">{s.label}</span>
                    <span className="text-xs text-neutral-600">
                      {s.models.length} model{s.models.length === 1 ? "" : "s"}
                    </span>
                  </button>
                </td>
                <td className="py-3 pr-6">
                  <div className="flex items-center gap-3">
                    <div className="w-28">
                      <UsageBar pct={s.sessionPct} />
                    </div>
                    <span className="tabular-nums text-neutral-400">
                      ~{s.sessionPct}% · {formatTokens(s.sessionTokens)}
                    </span>
                  </div>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-28">
                      <UsageBar pct={s.weeklyPct} />
                    </div>
                    <span className="tabular-nums text-neutral-400">
                      ~{s.weeklyPct}% · {formatTokens(s.weeklyTokens)}
                    </span>
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr className="border-t border-white/5 bg-white/[0.015]">
                  <td colSpan={3} className="px-2 py-3">
                    <ModelBreakdown models={s.models} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
