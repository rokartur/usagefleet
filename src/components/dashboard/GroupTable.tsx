import { Fragment } from "react";
import { UsageBar } from "@/components/usage-ui";
import { formatTokens } from "@/lib/format";
import type { LiveGroupUsage } from "@/lib/data";
import type { ModelUsage } from "@/lib/usage";
import { EmptyState } from "./EmptyState";

/** One group's per-model tokens, session (5h) and weekly side by side. Models
 *  active in either window appear; a window with no activity reads "—". */
function ModelCompare({
  session,
  weekly,
}: {
  session: ModelUsage[];
  weekly: ModelUsage[];
}) {
  const byKey = new Map<
    string,
    { model: string; label: string; session?: ModelUsage; weekly?: ModelUsage }
  >();
  for (const m of weekly)
    byKey.set(m.model, { model: m.model, label: m.label, weekly: m });
  for (const m of session) {
    const cur = byKey.get(m.model);
    if (cur) cur.session = m;
    else byKey.set(m.model, { model: m.model, label: m.label, session: m });
  }
  const rows = [...byKey.values()].sort(
    (a, b) =>
      (b.weekly?.billableTokens ?? 0) - (a.weekly?.billableTokens ?? 0) ||
      (b.session?.billableTokens ?? 0) - (a.session?.billableTokens ?? 0),
  );
  if (rows.length === 0) {
    return (
      <p className="px-2 text-xs text-neutral-500">
        No model activity in the current windows yet.
      </p>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wide text-neutral-600">
          <th className="px-2 pb-1.5 font-medium">Model</th>
          <th className="px-2 pb-1.5 text-right font-medium">Session (5h)</th>
          <th className="px-2 pb-1.5 text-right font-medium">Weekly</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.model} className="border-t border-white/5">
            <td className="px-2 py-1.5 font-medium text-neutral-200">
              {r.label}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-neutral-300">
              {r.session ? formatTokens(r.session.billableTokens) : "—"}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums text-neutral-300">
              {r.weekly ? formatTokens(r.weekly.billableTokens) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Group-vs-group comparison over both windows. Rows expand to reveal each
 *  group's per-model session/weekly breakdown. Expand keys are the raw groupId
 *  (or "ungrouped"). */
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
          <th className="pb-2 font-medium">Session (5h)</th>
          <th className="pb-2 font-medium">Weekly</th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => {
          const key = g.groupId ?? "ungrouped";
          const isOpen = expanded.has(key);
          const modelCount = new Set(
            [...g.models, ...g.sessionModels].map((m) => m.model),
          ).size;
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
                      {modelCount} model{modelCount === 1 ? "" : "s"}
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
                    <ModelCompare session={g.sessionModels} weekly={g.models} />
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
