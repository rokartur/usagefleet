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
import type { DeviceCatalogEntry, GroupCatalogEntry } from "@/lib/data";
import type {
  ModelUsage,
  TimelineBucket,
  TimelineCell,
  TimelineMetric,
} from "@/lib/usage";
import { metricValue, modelLabel } from "@/lib/usage";
import { AXIS, ChartTooltip, colorAt, GRID } from "./chart-theme";

type Mode = "group" | "model" | "total";
type Range = "24h" | "7d" | "30d" | "month" | "custom";

interface Series {
  key: string;
  name: string;
  color: string;
}

const UNGROUPED_COLOR = "#94a3b8";
const SOURCE_LABELS: Record<string, string> = {
  cli: "Claude Code",
  desktop: "Claude Desktop",
};

const safeId = (s: string) => s.replace(/[^a-zA-Z0-9_-]/g, "_");
const dayOf = (ts: string) => ts.slice(0, 10);

const METRIC_OPTIONS: { value: TimelineMetric; label: string; noun: string }[] = [
  { value: "billable", label: "Billable", noun: "billable tokens" },
  { value: "total", label: "Total", noun: "total tokens" },
  { value: "input", label: "Input", noun: "input tokens" },
  { value: "output", label: "Output", noun: "output tokens" },
  { value: "cacheRead", label: "Cache", noun: "cache-read tokens" },
];

/** Headline stacked-area chart of token usage over time. All series splitting
 *  AND filtering happens here from the per-bucket {@link TimelineCell} grid, so
 *  any group/model/source/device combination can be sliced without a server
 *  round trip. Independent controls (local state, so the 5s poll never resets
 *  them):
 *   • dimension — group / model / total (how series are split)
 *   • range     — 24h (hourly) / 7d / 30d / month / custom (date range)
 *   • metric    — which token component to plot
 *   • filters   — restrict to chosen groups / sources / devices
 *   • series    — click a legend chip to hide/show an individual series. */
export function UsageTimelineChart({
  timeline,
  timelineHourly,
  timeline30d,
  timelineMonthly,
  timelineDaily,
  groupCatalog,
  deviceCatalog,
  models,
}: {
  timeline: TimelineBucket[];
  timelineHourly: TimelineBucket[];
  timeline30d: TimelineBucket[];
  timelineMonthly: TimelineBucket[];
  timelineDaily: TimelineBucket[];
  groupCatalog: GroupCatalogEntry[];
  deviceCatalog: DeviceCatalogEntry[];
  models: ModelUsage[];
}) {
  const [mode, setMode] = useState<Mode>("group");
  const [range, setRange] = useState<Range>("7d");
  const [metric, setMetric] = useState<TimelineMetric>("billable");
  // Series keys the user toggled off via the legend (keyed by series key).
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  // Dimension filters — an empty set means "all" (no restriction).
  const [groupSel, setGroupSel] = useState<Set<string>>(() => new Set());
  const [sourceSel, setSourceSel] = useState<Set<string>>(() => new Set());
  const [deviceSel, setDeviceSel] = useState<Set<string>>(() => new Set());
  const [showFilters, setShowFilters] = useState(false);
  // Custom range bounds (YYYY-MM-DD). Empty falls back to the full daily span.
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const toggleIn =
    (set: (fn: (prev: Set<string>) => Set<string>) => void) => (key: string) =>
      set((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
  const toggleHidden = toggleIn(setHidden);
  const toggleGroup = toggleIn(setGroupSel);
  const toggleSource = toggleIn(setSourceSel);
  const toggleDevice = toggleIn(setDeviceSel);

  // Bounds for the custom date inputs, from the all-time daily series.
  const dayMin = timelineDaily[0] ? dayOf(timelineDaily[0].ts) : "";
  const dayMax = timelineDaily.at(-1) ? dayOf(timelineDaily.at(-1)!.ts) : "";
  const effStart = customStart || dayMin;
  const effEnd = customEnd || dayMax;

  // Buckets for the selected range. Custom slices the all-time daily series.
  const buckets = useMemo(() => {
    if (range === "24h") return timelineHourly;
    if (range === "7d") return timeline;
    if (range === "30d") return timeline30d;
    if (range === "month") return timelineMonthly;
    return timelineDaily.filter((b) => {
      const d = dayOf(b.ts);
      return d >= effStart && d <= effEnd;
    });
  }, [
    range,
    timeline,
    timelineHourly,
    timeline30d,
    timelineMonthly,
    timelineDaily,
    effStart,
    effEnd,
  ]);

  const groupMeta = useMemo(
    () => new Map(groupCatalog.map((g) => [g.id, g])),
    [groupCatalog],
  );
  const deviceMeta = useMemo(
    () => new Map(deviceCatalog.map((d) => [d.id, d.name])),
    [deviceCatalog],
  );
  const modelMeta = useMemo(
    () => new Map(models.map((m) => [m.model, m.label])),
    [models],
  );

  const groupName = (k: string) =>
    k === "ungrouped" ? "Ungrouped" : (groupMeta.get(k)?.name ?? "Unknown");
  const deviceName = (k: string) =>
    k === "unknown" ? "Unknown device" : (deviceMeta.get(k) ?? k);
  const sourceName = (k: string) => SOURCE_LABELS[k] ?? k;

  // Distinct filter options for the current range, from the UNFILTERED cells, so
  // toggling one filter never makes another's options disappear.
  const { groupOpts, sourceOpts, deviceOpts } = useMemo(() => {
    const g = new Set<string>();
    const s = new Set<string>();
    const d = new Set<string>();
    for (const b of buckets)
      for (const c of b.cells) {
        g.add(c.g);
        s.add(c.s);
        d.add(c.d);
      }
    const sortByLabel = (label: (k: string) => string) => (a: string, b: string) =>
      label(a).localeCompare(label(b));
    return {
      groupOpts: [...g].sort(sortByLabel(groupName)),
      sourceOpts: [...s].sort(sortByLabel(sourceName)),
      deviceOpts: [...d].sort(sortByLabel(deviceName)),
    };
    // groupName/deviceName/sourceName are pure over the memoized meta maps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, groupMeta, deviceMeta]);

  // Stable color per series key: sorted distinct keys for the dimension over the
  // UNFILTERED range, so colors don't shuffle when the metric changes, the sort
  // order changes, or a filter is toggled.
  const colorOrder = useMemo(() => {
    const keys = new Set<string>();
    for (const b of buckets)
      for (const c of b.cells) keys.add(mode === "group" ? c.g : c.m);
    return [...keys].sort();
  }, [buckets, mode]);
  const fallbackColor = (k: string) => colorAt(colorOrder.indexOf(k));

  const { rows, series } = useMemo(() => {
    const matches = (c: TimelineCell) =>
      (groupSel.size === 0 || groupSel.has(c.g)) &&
      (sourceSel.size === 0 || sourceSel.has(c.s)) &&
      (deviceSel.size === 0 || deviceSel.has(c.d));

    if (mode === "total") {
      return {
        rows: buckets.map((b) => {
          let total = 0;
          for (const c of b.cells)
            if (matches(c)) total += metricValue(c.totals, metric);
          return { label: b.label, total };
        }),
        series: [{ key: "total", name: "Total", color: "#a3a3a3" }] as Series[],
      };
    }

    const keyOf = (c: TimelineCell) => (mode === "group" ? c.g : c.m);
    // Sum the metric per key across the (filtered) cells, drop zero keys, order
    // descending so the biggest contributor stacks at the bottom.
    const totals = new Map<string, number>();
    for (const b of buckets)
      for (const c of b.cells)
        if (matches(c)) {
          const k = keyOf(c);
          totals.set(k, (totals.get(k) ?? 0) + metricValue(c.totals, metric));
        }
    const keys = [...totals.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k]) => k);

    const series: Series[] = keys.map((k) =>
      mode === "group"
        ? {
            key: k,
            name: groupName(k),
            color:
              k === "ungrouped"
                ? UNGROUPED_COLOR
                : (groupMeta.get(k)?.color ?? fallbackColor(k)),
          }
        : {
            key: k,
            name: modelMeta.get(k) ?? (k === "unknown" ? "Unknown" : modelLabel(k)),
            color: fallbackColor(k),
          },
    );

    const rows = buckets.map((b) => {
      const acc = new Map<string, number>();
      for (const c of b.cells)
        if (matches(c)) {
          const k = keyOf(c);
          acc.set(k, (acc.get(k) ?? 0) + metricValue(c.totals, metric));
        }
      const row: Record<string, number | string> = { label: b.label };
      for (const k of keys) row[k] = acc.get(k) ?? 0;
      return row;
    });
    return { rows, series };
    // groupName/colors are pure over the memoized meta maps + colorOrder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buckets, mode, metric, groupSel, sourceSel, deviceSel, groupMeta, modelMeta, colorOrder]);

  // Series actually drawn (legend toggles applied here, not in the memo).
  const visible = series.filter((s) => !hidden.has(s.key));
  const hasData = visible.some((s) => rows.some((r) => Number(r[s.key] ?? 0) > 0));
  const stackId = mode === "total" ? undefined : "u";
  const showLegend = mode !== "total" && series.length > 1;

  const activeFilters = groupSel.size + sourceSel.size + deviceSel.size;
  const clearFilters = () => {
    setGroupSel(new Set());
    setSourceSel(new Set());
    setDeviceSel(new Set());
  };

  const metricNoun =
    METRIC_OPTIONS.find((m) => m.value === metric)?.noun ?? "tokens";
  const subtitle =
    range === "24h"
      ? `Hourly ${metricNoun} · last 24h`
      : range === "30d"
        ? `Daily ${metricNoun} · last 30 days`
        : range === "month"
          ? `Monthly ${metricNoun} · all time`
          : range === "custom"
            ? `Daily ${metricNoun} · ${effStart || "—"} → ${effEnd || "—"}`
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
              { value: "custom", label: "Custom" },
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
          <button
            type="button"
            aria-pressed={showFilters}
            onClick={() => setShowFilters((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
              showFilters || activeFilters
                ? "border-white/20 bg-white/5 text-neutral-200"
                : "border-white/10 text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Filters
            {activeFilters > 0 && (
              <span className="rounded-full bg-white/15 px-1.5 text-[10px] text-neutral-100">
                {activeFilters}
              </span>
            )}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-4 flex flex-col gap-3 rounded-md border border-white/10 bg-black/30 p-3">
          {range === "custom" && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-400">
              <span className="text-neutral-500">Range</span>
              <input
                type="date"
                aria-label="Start date"
                min={dayMin}
                max={effEnd || dayMax}
                value={effStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="rounded border border-white/10 bg-[#0a0a0a] px-2 py-1 text-neutral-200 [color-scheme:dark]"
              />
              <span className="text-neutral-600">→</span>
              <input
                type="date"
                aria-label="End date"
                min={effStart || dayMin}
                max={dayMax}
                value={effEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="rounded border border-white/10 bg-[#0a0a0a] px-2 py-1 text-neutral-200 [color-scheme:dark]"
              />
            </div>
          )}
          <FilterRow
            label="Source"
            options={sourceOpts}
            selected={sourceSel}
            nameOf={sourceName}
            onToggle={toggleSource}
          />
          <FilterRow
            label="Group"
            options={groupOpts}
            selected={groupSel}
            nameOf={groupName}
            colorOf={(k) =>
              k === "ungrouped"
                ? UNGROUPED_COLOR
                : (groupMeta.get(k)?.color ?? undefined)
            }
            onToggle={toggleGroup}
          />
          <FilterRow
            label="Device"
            options={deviceOpts}
            selected={deviceSel}
            nameOf={deviceName}
            onToggle={toggleDevice}
          />
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="self-start text-xs text-neutral-500 underline-offset-2 hover:text-neutral-300 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {showLegend && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {series.map((s) => {
            const off = hidden.has(s.key);
            return (
              <button
                key={s.key}
                type="button"
                aria-pressed={!off}
                onClick={() => toggleHidden(s.key)}
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
          {activeFilters > 0
            ? "No activity matches the current filters."
            : range === "24h"
              ? "No activity in the last 24 hours."
              : range === "30d"
                ? "No activity in the last 30 days."
                : range === "month"
                  ? "No activity recorded yet."
                  : range === "custom"
                    ? "No activity in the selected range."
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

/** One row of multi-select filter chips (Source / Group / Device). Empty
 *  selection = no restriction; clicking a chip toggles that value. */
function FilterRow({
  label,
  options,
  selected,
  nameOf,
  colorOf,
  onToggle,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  nameOf: (k: string) => string;
  colorOf?: (k: string) => string | undefined;
  onToggle: (k: string) => void;
}) {
  if (options.length <= 1) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-xs text-neutral-500">{label}</span>
      {options.map((k) => {
        const on = selected.size === 0 || selected.has(k);
        const color = colorOf?.(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={selected.has(k)}
            onClick={() => onToggle(k)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors ${
              on
                ? "border-white/15 text-neutral-200 hover:bg-white/5"
                : "border-white/10 text-neutral-600 hover:text-neutral-400"
            }`}
          >
            {color && (
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: color, opacity: on ? 1 : 0.3 }}
              />
            )}
            {nameOf(k)}
          </button>
        );
      })}
    </div>
  );
}
