"use client";

import { useState } from "react";
import { EmptyState } from "@/components/dashboard/EmptyState";
import type { HistoryDTO, HistoryRow } from "@/lib/data";
import { formatTokens, formatUsd } from "@/lib/format";
import { bucketKeys, bucketLabel, daySpan, modelLabel, utcDay } from "@/lib/usage";

const DAY_MS = 864e5;
/** Above this many days the chart switches from daily to monthly columns. */
const MAX_DAILY_COLUMNS = 92;

const PERIODS = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "month", label: "This month" },
  { key: "today", label: "Today" },
  { key: "all", label: "All time" },
  { key: "custom", label: "Custom range" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

const DIMENSIONS = [
  { key: "group", label: "Group" },
  { key: "model", label: "Model" },
  { key: "device", label: "Device" },
  { key: "source", label: "Source" },
] as const;
type Dim = (typeof DIMENSIONS)[number]["key"];

const METRICS = [
  { key: "billable", label: "Billable tokens" },
  { key: "total", label: "Total tokens" },
  { key: "input", label: "Input tokens" },
  { key: "output", label: "Output tokens" },
  { key: "cacheRead", label: "Cache-read tokens" },
  { key: "cost", label: "Cost (USD)" },
] as const;
type Metric = (typeof METRICS)[number]["key"];

/** Series colors for dimensions that carry no color of their own (model /
 *  device / source); groups use their configured color. */
const PALETTE = [
  "#6366f1", "#22d3ee", "#f59e0b", "#10b981",
  "#f472b6", "#a855f7", "#ef4444", "#84cc16",
];
const SOURCE_LABEL: Record<string, string> = {
  cli: "Claude Code",
  desktop: "Claude Desktop",
  pi: "pi",
};

const daysAgo = (n: number) => utcDay(new Date(Date.now() - n * DAY_MS));

/** [from, to] day-key bounds (inclusive); "custom" uses the date inputs. */
function periodBounds(key: PeriodKey, from: string, to: string): [string, string] {
  const today = utcDay(new Date());
  switch (key) {
    case "today":
      return [today, today];
    case "7d":
      return [daysAgo(6), today];
    case "30d":
      return [daysAgo(29), today];
    case "90d":
      return [daysAgo(89), today];
    case "month":
      return [`${today.slice(0, 7)}-01`, today];
    case "all":
      return ["0000-01-01", today];
    case "custom":
      return [from || "0000-01-01", to || today];
  }
}

const billable = (r: HistoryRow) =>
  r.inputTokens + r.outputTokens + r.cacheCreationTokens;
const total = (r: HistoryRow) => billable(r) + r.cacheReadTokens;

function metricValue(r: HistoryRow, m: Metric): number {
  switch (m) {
    case "cost":
      return r.costUsd;
    case "billable":
      return billable(r);
    case "total":
      return total(r);
    case "input":
      return r.inputTokens;
    case "output":
      return r.outputTokens;
    case "cacheRead":
      return r.cacheReadTokens;
  }
}

/** The row's key along one dimension; nulls map to the usual sentinels. */
function keyOf(r: HistoryRow, dim: Dim): string {
  switch (dim) {
    case "group":
      return r.groupId ?? "ungrouped";
    case "model":
      return r.model ?? "unknown";
    case "device":
      return r.deviceId ?? "unknown";
    case "source":
      return r.source ?? "cli";
  }
}

const formatMetric = (v: number, m: Metric) =>
  m === "cost" ? formatUsd(v) : formatTokens(v);

/** Stacked columns, one per bucket, segments in `series` order. */
function StackedBars({
  buckets,
  series,
  metric,
}: {
  buckets: { key: string; label: string; parts: Map<string, number>; sum: number }[];
  series: { key: string; label: string; color: string }[];
  metric: Metric;
}) {
  const max = Math.max(...buckets.map((b) => b.sum), 0);
  const labelEvery = Math.ceil(buckets.length / 8);
  return (
    <div>
      <div className="flex h-44 items-end gap-px">
        {buckets.map((b) => (
          <div
            key={b.key}
            className="flex h-full flex-1 flex-col justify-end [&>*:first-child]:rounded-t-sm"
            title={`${b.label} · ${formatMetric(b.sum, metric)}${series
              .filter((s) => b.parts.get(s.key))
              .map((s) => `\n${s.label}: ${formatMetric(b.parts.get(s.key) ?? 0, metric)}`)
              .join("")}`}
          >
            {series.map((s) => {
              const v = b.parts.get(s.key) ?? 0;
              if (v <= 0) return null;
              return (
                <div
                  key={s.key}
                  style={{
                    height: `max(1px, ${max > 0 ? (v / max) * 100 : 0}%)`,
                    backgroundColor: s.color,
                  }}
                />
              );
            })}
            {b.sum === 0 && <div className="h-px bg-white/10" />}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-px text-[10px] text-neutral-600">
        {buckets.map((b, i) => (
          <span key={b.key} className="flex-1 truncate text-center">
            {i % labelEvery === 0 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

const CONTROL_CLS =
  "rounded border border-white/10 bg-transparent px-2 py-1 text-sm text-neutral-300 [color-scheme:dark]";

/** Charted, filterable view of the all-time usage history: pick a period, a
 *  metric, what to split the stack by, and which groups/models/devices/sources
 *  to include. */
export function UsageExplorer({ history }: { history: HistoryDTO }) {
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dim, setDim] = useState<Dim>("group");
  const [metric, setMetric] = useState<Metric>("billable");
  const [filters, setFilters] = useState<Record<Dim, string[]>>({
    group: [],
    model: [],
    device: [],
    source: [],
  });

  const groupName = new Map(history.groups.map((g) => [g.id, g.name]));
  const deviceName = new Map(history.devices.map((d) => [d.id, d.name]));
  const label = (d: Dim, key: string): string => {
    switch (d) {
      case "group":
        return key === "ungrouped"
          ? "Ungrouped"
          : (groupName.get(key) ?? "Deleted group");
      case "device":
        return key === "unknown"
          ? "Unknown device"
          : (deviceName.get(key) ?? "Deleted device");
      case "model":
        return modelLabel(key === "unknown" ? null : key);
      case "source":
        return SOURCE_LABEL[key] ?? key;
    }
  };

  // Every value each dimension takes across the WHOLE history, so the filter
  // chips don't disappear as soon as you filter something out.
  const dimValues: Record<Dim, string[]> = { group: [], model: [], device: [], source: [] };
  for (const d of DIMENSIONS) {
    dimValues[d.key] = [...new Set(history.rows.map((r) => keyOf(r, d.key)))].sort(
      (a, b) => label(d.key, a).localeCompare(label(d.key, b)),
    );
  }

  const view = (() => {
    const [lo, hi] = periodBounds(period, from, to);
    const rows = history.rows.filter(
      (r) =>
        r.day >= lo &&
        r.day <= hi &&
        DIMENSIONS.every(
          (d) =>
            filters[d.key].length === 0 || filters[d.key].includes(keyOf(r, d.key)),
        ),
    );
    if (rows.length === 0) return null;

    // "All time" / an open-ended custom range starts at the first active day,
    // and no range draws empty columns past today.
    const today = utcDay(new Date());
    const start =
      lo === "0000-01-01" ? rows.reduce((m, r) => (r.day < m ? r.day : m), hi) : lo;
    const end = hi < today ? hi : today;
    const monthly = daySpan(start, end) > MAX_DAILY_COLUMNS;

    const parts = new Map<string, Map<string, number>>();
    const totals = new Map<string, { billable: number; total: number; cost: number; metric: number }>();
    for (const r of rows) {
      const k = keyOf(r, dim);
      const bk = monthly ? r.day.slice(0, 7) : r.day;
      const bucket = parts.get(bk) ?? new Map<string, number>();
      bucket.set(k, (bucket.get(k) ?? 0) + metricValue(r, metric));
      parts.set(bk, bucket);
      const t = totals.get(k) ?? { billable: 0, total: 0, cost: 0, metric: 0 };
      t.billable += billable(r);
      t.total += total(r);
      t.cost += r.costUsd;
      t.metric += metricValue(r, metric);
      totals.set(k, t);
    }

    const series = [...totals.entries()]
      .sort((a, b) => b[1].metric - a[1].metric || b[1].total - a[1].total)
      .map(([key, t]) => ({
        key,
        label: label(dim, key),
        // Palette index comes from the stable dimension order, so a series
        // keeps its color when you change the metric or period.
        color:
          dim === "group"
            ? (history.groups.find((g) => g.id === key)?.color ?? "#94a3b8")
            : PALETTE[Math.max(0, dimValues[dim].indexOf(key)) % PALETTE.length],
        ...t,
      }));

    const buckets = bucketKeys(start, end, monthly).map((key) => {
      const p = parts.get(key) ?? new Map<string, number>();
      return {
        key,
        label: bucketLabel(key),
        parts: p,
        sum: [...p.values()].reduce((s, v) => s + v, 0),
      };
    });

    const sum = series.reduce(
      (s, r) => ({
        billable: s.billable + r.billable,
        total: s.total + r.total,
        cost: s.cost + r.cost,
      }),
      { billable: 0, total: 0, cost: 0 },
    );
    const peak = Math.max(...buckets.map((b) => b.sum), 0);
    return { series, buckets, sum, peak, monthly };
  })();

  const toggle = (d: Dim, key: string) =>
    setFilters((f) => ({
      ...f,
      [d]: f[d].includes(key) ? f[d].filter((k) => k !== key) : [...f[d], key],
    }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PeriodKey)}
          className={CONTROL_CLS}
          aria-label="Period"
        >
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key} className="bg-[#0a0a0a]">
              {p.label}
            </option>
          ))}
        </select>
        {period === "custom" && (
          <>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={CONTROL_CLS}
              aria-label="From"
            />
            <span className="text-neutral-600">–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={CONTROL_CLS}
              aria-label="To"
            />
          </>
        )}
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as Metric)}
          className={CONTROL_CLS}
          aria-label="Metric"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key} className="bg-[#0a0a0a]">
              {m.label}
            </option>
          ))}
        </select>
        <select
          value={dim}
          onChange={(e) => setDim(e.target.value as Dim)}
          className={CONTROL_CLS}
          aria-label="Split by"
        >
          {DIMENSIONS.map((d) => (
            <option key={d.key} value={d.key} className="bg-[#0a0a0a]">
              Split by {d.label.toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {DIMENSIONS.filter((d) => dimValues[d.key].length > 1).map((d) => (
        <div key={d.key} className="flex flex-wrap items-center gap-1.5">
          <span className="w-14 text-xs text-neutral-500">{d.label}</span>
          {dimValues[d.key].map((key) => {
            const on = filters[d.key].length === 0 || filters[d.key].includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(d.key, key)}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  on
                    ? "border-white/20 bg-white/10 text-neutral-200"
                    : "border-white/10 text-neutral-600 hover:text-neutral-400"
                }`}
              >
                {label(d.key, key)}
              </button>
            );
          })}
          {filters[d.key].length > 0 && (
            <button
              type="button"
              onClick={() => setFilters((f) => ({ ...f, [d.key]: [] }))}
              className="px-1 text-xs text-neutral-500 underline hover:text-neutral-300"
            >
              all
            </button>
          )}
        </div>
      ))}

      {!view ? (
        <EmptyState>No activity for these filters.</EmptyState>
      ) : (
        <>
          <div className="flex items-baseline justify-between text-xs text-neutral-500">
            <span>
              {view.monthly ? "Per month" : "Per day"} (UTC) ·{" "}
              {METRICS.find((m) => m.key === metric)?.label.toLowerCase()}
            </span>
            <span className="tabular-nums">
              peak {formatMetric(view.peak, metric)}
            </span>
          </div>
          <StackedBars buckets={view.buckets} series={view.series} metric={metric} />
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-neutral-500">
                <th className="pb-2 pr-2 text-left font-medium">
                  {DIMENSIONS.find((d) => d.key === dim)?.label}
                </th>
                <th className="px-2 pb-2 text-right font-medium">Billable</th>
                <th className="px-2 pb-2 text-right font-medium">Total</th>
                <th className="pb-2 pl-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {view.series.map((s) => (
                <tr key={s.key} className="border-t border-white/10 text-neutral-300">
                  <td className="py-2.5 pr-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      {s.label}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatTokens(s.billable)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-neutral-400">
                    {formatTokens(s.total)}
                  </td>
                  <td
                    className="py-2.5 pl-2 text-right tabular-nums text-neutral-200"
                    title="At public API list prices"
                  >
                    {formatUsd(s.cost)}
                  </td>
                </tr>
              ))}
              {view.series.length > 1 && (
                <tr className="border-t border-white/10 text-neutral-400">
                  <td className="py-2.5 pr-2">Σ</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatTokens(view.sum.billable)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatTokens(view.sum.total)}
                  </td>
                  <td className="py-2.5 pl-2 text-right tabular-nums">
                    {formatUsd(view.sum.cost)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
