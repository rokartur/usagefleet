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
import type { ModelUsage, TimelineBucket, TimelineMetric } from "@/lib/usage";
import { metricValue, modelLabel } from "@/lib/usage";
import { AXIS, ChartTooltip, colorAt, GRID } from "./chart-theme";

type Mode = "group" | "model" | "total";
type Range = "24h" | "7d" | "30d" | "month";

interface Series {
  key: string;
  name: string;
  color: string;
}

const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");

const METRIC_OPTIONS: { value: TimelineMetric; label: string; noun: string }[] = [
  { value: "billable", label: "Billable", noun: "billable tokens" },
  { value: "total", label: "Total", noun: "total tokens" },
  { value: "input", label: "Input", noun: "input tokens" },
  { value: "output", label: "Output", noun: "output tokens" },
  { value: "cacheRead", label: "Cache", noun: "cache-read tokens" },
];

/** Headline stacked-area chart of token usage over time. Four independent
 *  filters (all local state so the 5s poll never resets them):
 *   • dimension — group / model / total (how series are split)
 *   • range     — last 24h (hourly) / last 7 days (daily)
 *   • metric    — which token component to plot (billable, total, in, out, cache)
 *   • series    — click a legend chip to hide/show an individual group/model. */
export function UsageTimelineChart({
  timeline,
  timelineHourly,
  timeline30d,
  timelineMonthly,
  groups,
  models,
}: {
  timeline: TimelineBucket[];
  timelineHourly: TimelineBucket[];
  timeline30d: TimelineBucket[];
  timelineMonthly: TimelineBucket[];
  groups: LiveGroupUsage[];
  models: ModelUsage[];
}) {
  const [mode, setMode] = useState<Mode>("group");
  const [range, setRange] = useState<Range>("7d");
  const [metric, setMetric] = useState<TimelineMetric>("billable");
  // Series keys the user has toggled off via the legend. Keyed by series key, so
  // switching dimension (group↔model keys differ) naturally shows everything.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const buckets =
    range === "24h"
      ? timelineHourly
      : range === "30d"
        ? timeline30d
        : range === "month"
          ? timelineMonthly
          : timeline;

  const { rows, series } = useMemo(() => {
    if (mode === "total") {
      return {
        rows: buckets.map((b) => ({
          label: b.label,
          total: metricValue(b.totals, metric),
        })),
        series: [{ key: "total", name: "Total", color: "#a3a3a3" }] as Series[],
      };
    }
    const pick = (b: TimelineBucket) => (mode === "group" ? b.byGroup : b.byModel);
    // Sum the selected metric per key across buckets, drop keys that are zero for
    // this metric (e.g. cache-only keys vanish from the billable view), and order
    // descending so the biggest contributor stacks at the bottom.
    const totals = new Map<string, number>();
    for (const b of buckets) {
      for (const [k, tt] of Object.entries(pick(b))) {
        totals.set(k, (totals.get(k) ?? 0) + metricValue(tt, metric));
      }
    }
    const keys = [...totals.entries()]
      .filter(([, v]) => v > 0)
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
      return { key: k, name: modelMeta.get(k) ?? (k === "unknown" ? "Unknown" : modelLabel(k)), color: colorAt(i) };
    });

    const rows = buckets.map((b) => {
      const src = pick(b);
      const row: Record<string, number | string> = { label: b.label };
      for (const k of keys) row[k] = src[k] ? metricValue(src[k], metric) : 0;
      return row;
    });
    return { rows, series };
  }, [buckets, groups, models, mode, metric]);

  // Series actually drawn (legend toggles are applied here, not in the memo, so
  // toggling doesn't recompute the row data).
  const visible = series.filter((s) => !hidden.has(s.key));
  const hasData = visible.some((s) =>
    rows.some((r) => Number(r[s.key] ?? 0) > 0),
  );
  const stackId = mode === "total" ? undefined : "u";
  const showLegend = mode !== "total" && series.length > 1;

  const metricNoun =
    METRIC_OPTIONS.find((m) => m.value === metric)?.noun ?? "tokens";
  const subtitle =
    range === "24h"
      ? `Hourly ${metricNoun} · last 24h`
      : range === "30d"
        ? `Daily ${metricNoun} · last 30 days`
        : range === "month"
          ? `Monthly ${metricNoun} · all time`
          : `Daily ${metricNoun} · last 7 days`;

  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium text-neutral-400">Usage over time</h2>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            size="sm"
            ariaLabel="Time range"
            value={range}
            onChange={setRange}
            options={[
              { value: "24h", label: "24h" },
              { value: "7d", label: "7d" },
              { value: "30d", label: "30d" },
              { value: "month", label: "Month" },
            ]}
          />
          <Tabs
            size="sm"
            ariaLabel="Token metric"
            value={metric}
            onChange={setMetric}
            options={METRIC_OPTIONS.map((m) => ({ value: m.value, label: m.label }))}
          />
          <Tabs
            size="sm"
            ariaLabel="Timeline dimension"
            value={mode}
            onChange={setMode}
            options={[
              { value: "group", label: "By group" },
              { value: "model", label: "By model" },
              { value: "total", label: "Total" },
            ]}
          />
        </div>
      </div>

      {showLegend && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() => toggle(s.key)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  off
                    ? "border-white/10 text-neutral-600 hover:text-neutral-400"
                    : "border-white/15 text-neutral-300 hover:bg-white/5"
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color, opacity: off ? 0.3 : 1 }}
                />
                {s.name}
              </button>
            );
          })}
        </div>
      )}

      {!hasData ? (
        <EmptyState>
          {range === "24h"
            ? "No activity in the last 24 hours."
            : range === "30d"
              ? "No activity in the last 30 days."
              : range === "month"
                ? "No activity recorded yet."
                : "No activity in the last 7 days."}
        </EmptyState>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
              <defs>
                {visible.map((s) => (
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
              {visible.map((s) => (
                <Area
                  key={s.key}
                  // Linear (not monotone) — monotone curves overshoot through
                  // empty (zero) days, bulging the fill where there's no data.
                  type="linear"
                  dataKey={s.key}
                  name={s.name}
                  stackId={stackId}
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
