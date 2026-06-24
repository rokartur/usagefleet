"use client";

import type { TooltipContentProps } from "recharts";
import { formatTokens } from "@/lib/format";

/**
 * Categorical palette for models / devices (groups carry their own `.color`).
 * Tuned for the #000 / #0a0a0a dark surface; deliberately avoids saturated
 * red/amber, which are reserved for `UsageBar`'s threshold semantics.
 */
export const CHART_PALETTE = [
  "#818cf8", // indigo-400
  "#22d3ee", // cyan-400
  "#34d399", // emerald-400
  "#a78bfa", // violet-400
  "#f472b6", // pink-400
  "#60a5fa", // blue-400
  "#4ade80", // green-400
  "#fbbf24", // amber-400 (last)
];

export const colorAt = (i: number): string =>
  CHART_PALETTE[((i % CHART_PALETTE.length) + CHART_PALETTE.length) % CHART_PALETTE.length];

/** Shared axis styling passed to recharts XAxis/YAxis. */
export const AXIS = {
  stroke: "rgba(255,255,255,0.10)",
  tick: { fill: "#737373", fontSize: 11 }, // neutral-500
  tickLine: false,
  axisLine: false,
} as const;

/** Shared CartesianGrid styling — faint horizontal hairlines only. */
export const GRID = {
  stroke: "rgba(255,255,255,0.06)",
  vertical: false,
} as const;

const num = (v: unknown): number => (typeof v === "number" ? v : 0);

/**
 * Dark tooltip matching the card chrome. Lists each series (value desc, zeros
 * hidden) with its color swatch, plus a total when multiple series are present.
 * Token values are formatted via `formatTokens`.
 */
export function ChartTooltip(
  props: Partial<TooltipContentProps<number, string>>,
) {
  const { active, payload, label } = props;
  if (!active || !payload || payload.length === 0) return null;
  const rows = payload
    .map((p) => ({
      key: String(p.dataKey ?? p.name ?? ""),
      name: String(p.name ?? p.dataKey ?? ""),
      value: num(p.value),
      color: p.color ?? "#a3a3a3",
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="rounded-md border border-white/10 bg-[#0a0a0a]/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label != null && (
        <p className="mb-1 font-medium text-neutral-300">{String(label)}</p>
      )}
      <ul className="flex min-w-[8rem] flex-col gap-0.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2 tabular-nums">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: r.color }}
            />
            <span className="text-neutral-400">{r.name}</span>
            <span className="ml-auto text-neutral-200">{formatTokens(r.value)}</span>
          </li>
        ))}
        {rows.length > 1 && (
          <li className="mt-1 flex items-center gap-2 border-t border-white/10 pt-1 tabular-nums text-neutral-300">
            <span className="text-neutral-500">Total</span>
            <span className="ml-auto">{formatTokens(total)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}
