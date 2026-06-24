import { Fragment } from "react";
import { UsageBar } from "@/components/usage-ui";
import { formatRelative, formatTokens, OS_LABEL } from "@/lib/format";
import type { DeviceUsageDTO } from "@/lib/data";
import { EmptyState } from "./EmptyState";
import { ModelBreakdown } from "./ModelBreakdown";

/** Per-device breakdown table. Rows expand to each device's per-model token
 *  breakdown. Device keys are namespaced `dev:<id>` so they coexist with group
 *  keys in the shared `expanded` Set. */
export function DeviceTable({
  devices,
  expanded,
  onToggle,
}: {
  devices: DeviceUsageDTO[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
}) {
  if (devices.length === 0) {
    return (
      <EmptyState>No devices have reported usage in the current windows yet.</EmptyState>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
          <th className="pb-2 font-medium">Device</th>
          <th className="pb-2 font-medium">Session</th>
          <th className="pb-2 font-medium">Weekly</th>
        </tr>
      </thead>
      <tbody>
        {devices.map((d) => {
          const key = `dev:${d.deviceId}`;
          const isOpen = expanded.has(key);
          return (
            <Fragment key={key}>
              <tr className="border-t border-white/10">
                <td className="py-3 pr-6">
                  <button
                    type="button"
                    onClick={() => onToggle(key)}
                    aria-expanded={isOpen}
                    className="flex flex-col items-start gap-0.5 text-left hover:text-white"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`text-[10px] text-neutral-500 transition-transform ${
                          isOpen ? "rotate-90" : ""
                        }`}
                        aria-hidden
                      >
                        ▶
                      </span>
                      <span className="font-medium">{d.name}</span>
                      {d.os && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-neutral-300">
                          {OS_LABEL[d.os] ?? d.os}
                        </span>
                      )}
                      <span className="text-xs text-neutral-600">
                        {d.models.length} model{d.models.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="pl-5 text-xs text-neutral-500">
                      {d.groupName ? `${d.groupName} · ` : ""}
                      {d.hostname ? `${d.hostname} · ` : ""}
                      seen {formatRelative(d.lastSeenAt)}
                    </span>
                  </button>
                </td>
                <td className="py-3 pr-6">
                  <div className="flex items-center gap-3">
                    <div className="w-28">
                      <UsageBar pct={d.sessionPct} />
                    </div>
                    <span className="tabular-nums text-neutral-400">
                      ~{d.sessionPct}% · {formatTokens(d.sessionTokens)}
                    </span>
                  </div>
                </td>
                <td className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-28">
                      <UsageBar pct={d.weeklyPct} />
                    </div>
                    <span className="tabular-nums text-neutral-400">
                      ~{d.weeklyPct}% · {formatTokens(d.weeklyTokens)}
                    </span>
                  </div>
                </td>
              </tr>
              {isOpen && (
                <tr className="border-t border-white/5 bg-white/[0.015]">
                  <td colSpan={3} className="px-2 py-3">
                    <ModelBreakdown models={d.models} />
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
