import { Fragment } from "react";
import { UsageBar } from "@/components/usage-ui";
import { formatTokens } from "@/lib/format";
import type { LiveGroupUsage } from "@/lib/data";
import { EmptyState } from "./EmptyState";
import { ModelBreakdown } from "./ModelBreakdown";

/** Per-group breakdown table. Rows expand to reveal each group's per-model token
 *  breakdown. Group expand keys are the raw groupId (or "ungrouped"). */
export function GroupTable({
  groups,
  expanded,
  onToggle,
}: {
  groups: LiveGroupUsage[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (groups.length === 0) {
    return <EmptyState>No device activity in the current windows yet.</EmptyState>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <th className="pb-2 font-medium">Group</th>
          <th className="pb-2 font-medium">Session</th>
          <th className="pb-2 font-medium">Weekly</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const key = g.groupId ?? "ungrouped";
          const isOpen = expanded.has(key);
          return (
            <Fragment key={key}>
              <tr className="border-t border-white/10">
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => onToggle(key)}
                    aria-expanded={isOpen}
                    className="inline-flex items-center gap-2 text-left hover:text-white"
                  >
                    <span
                      className={`text-[10px] text-neutral-500 transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                      aria-hidden
                    >
                      ▶
                    </span>
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    {g.name}
                    <span className="text-xs text-neutral-600">
                      {g.models.length} model{g.models.length === 1 ? "" : "s"}
                    </span>
                  </button>
                </td>
                <td className="py-3 pr-6">
                  <div className="flex items-center gap-3">
                    <div className="w-28">
                      <UsageBar pct={g.sessionPct} />
                    </div>
                    <span className="tabular-nums text-neutral-400">
                      ~{g.sessionPct}% · {formatTokens(g.sessionTokens)}
                    </span>
                  </div>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-28">
                      <UsageBar pct={g.weeklyPct} />
                    </div>
                    <span className="tabular-nums text-neutral-400">
                      ~{g.weeklyPct}% · {formatTokens(g.weeklyTokens)}
                    </span>
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr className="border-t border-white/5 bg-white/[0.015]">
                  <td colSpan={3} className="px-2 py-3">
                    <ModelBreakdown models={g.models} />
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
