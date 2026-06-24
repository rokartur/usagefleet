"use client";

import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/dashboard/EmptyState";
import { Tabs } from "@/components/dashboard/Tabs";
import { formatTokens } from "@/lib/format";
import type { LiveGroupUsage } from "@/lib/data";
import type { ModelUsage, TimelineBucket } from "@/lib/usage";
import { AXIS, ChartTooltip, colorAt, GRID } from "./chart-theme";

type Mode = "group" | "model" | "total";

interface Series {
  key: string;
  name: string;
  color: string;
}

const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Headline stacked-area chart of daily billable tokens over the weekly window.
 *  Mode (group / model / total) is local state, so the 5s poll never resets it. */
export function UsageTimelineChart({
  timeline,
  groups,
  models,
}: {
  timeline: TimelineBucket[];
  groups: LiveGroupUsage[];
  models: ModelUsage[];
}) {
  const [mode, setMode] = useState<Mode>("group");

  const { rows, series } = useMemo(() => {
    if (mode === "total") {
      return {
        rows: timeline.map((b) => ({ label: b.label, total: b.total })),
        series: [{ key: "total", name: "Total", color: "#a3a3a3" }] as Series[],
      };
    }
    const pick = (b: TimelineBucket) => (mode === "group" ? b.byGroup : b.byModel);
    // Union of keys present across buckets, ordered by descending total so the
    // biggest contributor stacks at the bottom.
    const totals = new Map<string, number>();
    for (const b of timeline) {
      for (const [k, v] of Object.entries(pick(b))) {
        totals.set(k, (totals.get(k) ?? 0) + v);
      }
    }
    const keys = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    const groupMeta = new Map(
      groups.map((g) => [g.groupId ?? "ungrouped", { name: g.name, color: g.color }]),
    );
    const modelMeta = new Map(models.map((m) => [m.model, m.label]));

    const series: Series[] = keys.map((k, i) => {
      if (mode === "group") {
        const meta = groupMeta.get(k);
        return { key: k, name: meta?.name ?? (k === "ungrouped" ? "Ungrouped" : k), color: meta?.color ?? colorAt(i) };
      }
      return { key: k, name: modelMeta.get(k) ?? (k === "unknown" ? "Unknown" : k), color: colorAt(i) };
    });

    const rows = timeline.map((b) => {
      const src = pick(b);
      const row: Record<string, number | string> = { label: b.label };
      for (const k of keys) row[k] = src[k] ?? 0;
      return row;
    });
    return { rows, series };
  }, [timeline, groups, models, mode]);

  const hasData = timeline.some((b) => b.total > 0);

  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-neutral-400">Usage over time</h2>
          <p className="text-xs text-neutral-500">
            Daily billable tokens · last 7 days
          </p>
        </div>
        <Tabs
          size="sm"
          ariaLabel="Timeline mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "group", label: "By group" },
            { value: "model", label: "By model" },
            { value: "total", label: "Total" },
          ]}
        />
      </div>
      {!hasData ? (
        <EmptyState>No activity in the last 7 days.</EmptyState>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient
                    key={s.key}
                    id={`grad-${mode}-${safeId(s.key)}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} minTickGap={20} />
              <YAxis {...AXIS} width={52} tickFormatter={formatTokens} />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: "rgba(255,255,255,0.15)" }}
              />
              {series.map((s) => (
                <Area
                  key={s.key}
                  // Linear (not monotone) — monotone curves overshoot through
                  // empty (zero) days, bulging the fill where there's no data.
                  type="linear"
                  dataKey={s.key}
                  name={s.name}
                  stackId={mode === "total" ? undefined : "u"}
                  stroke={s.color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${mode}-${safeId(s.key)})`}
                  isAnimationActive={false}
                  // Show a dot so an isolated single-day value is still visible.
                  dot={{ r: 1.5, fill: s.color, strokeWidth: 0 }}
                  activeDot={{ r: 3 }}
                  connectNulls
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
