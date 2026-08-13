import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
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

const billable = (r: HistoryRow) => r.inputTokens + r.outputTokens + r.cacheCreationTokens;
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

const formatMetric = (v: number, m: Metric) => (m === "cost" ? formatUsd(v) : formatTokens(v));

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
        return key === "ungrouped" ? "Ungrouped" : (groupName.get(key) ?? "Deleted group");
      case "device":
        return key === "unknown" ? "Unknown device" : (deviceName.get(key) ?? "Deleted device");
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
    dimValues[d.key] = [...new Set(history.rows.map((r) => keyOf(r, d.key)))].sort((a, b) =>
      label(d.key, a).localeCompare(label(d.key, b)),
    );
  }

  const view = (() => {
    const [lo, hi] = periodBounds(period, from, to);
    const rows = history.rows.filter(
      (r) =>
        r.day >= lo &&
        r.day <= hi &&
        DIMENSIONS.every(
          (d) => filters[d.key].length === 0 || filters[d.key].includes(keyOf(r, d.key)),
        ),
    );
    if (rows.length === 0) return null;

    // "All time" / an open-ended custom range starts at the first active day,
    // and no range draws empty columns past today.
    const today = utcDay(new Date());
    const start = lo === "0000-01-01" ? rows.reduce((m, r) => (r.day < m ? r.day : m), hi) : lo;
    const end = hi < today ? hi : today;
    const monthly = daySpan(start, end) > MAX_DAILY_COLUMNS;

    const parts = new Map<string, Map<string, number>>();
    const totals = new Map<
      string,
      { billable: number; total: number; cost: number; metric: number }
    >();
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
            ? (history.groups.find((g) => g.id === key)?.color ?? "var(--chart-1)")
            : PALETTE[Math.max(0, dimValues[dim].indexOf(key)) % PALETTE.length],
        ...t,
      }));

    // One row per column, series values flattened onto it — recharts' shape.
    const data = bucketKeys(start, end, monthly).map((key) => {
      const p = parts.get(key) ?? new Map<string, number>();
      const row: Record<string, string | number> = { bucket: bucketLabel(key) };
      for (const s of series) row[s.key] = p.get(s.key) ?? 0;
      return row;
    });

    const sum = series.reduce(
      (s, r) => ({
        billable: s.billable + r.billable,
        total: s.total + r.total,
        cost: s.cost + r.cost,
      }),
      { billable: 0, total: 0, cost: 0 },
    );
    const config: ChartConfig = Object.fromEntries(
      series.map((s) => [s.key, { label: s.label, color: s.color }]),
    );
    return { series, data, sum, config, monthly };
  })();

  const metricLabel = METRICS.find((m) => m.key === metric)?.label ?? "";

  return (
    <Card>
      {/* Flex instead of the default header grid so the controls drop below the
          title on narrow viewports instead of squeezing it to one word a line. */}
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Usage over time</CardTitle>
          <CardDescription>
            {metricLabel.toLowerCase()} per {view?.monthly ? "month" : "day"} (UTC), split by{" "}
            {DIMENSIONS.find((d) => d.key === dim)?.label.toLowerCase()}. Cost is estimated at
            public API list prices, priced per model.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={period}
            onValueChange={(v) => {
              if (v) setPeriod(v);
            }}
            items={PERIODS.map((p) => ({ value: p.key, label: p.label }))}
          >
            <SelectTrigger size="sm" aria-label="Period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={metric}
            onValueChange={(v) => {
              if (v) setMetric(v);
            }}
            items={METRICS.map((m) => ({ value: m.key, label: m.label }))}
          >
            <SelectTrigger size="sm" aria-label="Metric">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METRICS.map((m) => (
                <SelectItem key={m.key} value={m.key}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={dim}
            onValueChange={(v) => {
              if (v) setDim(v);
            }}
            items={DIMENSIONS.map((d) => ({
              value: d.key,
              label: `Split by ${d.label.toLowerCase()}`,
            }))}
          >
            <SelectTrigger size="sm" aria-label="Split by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DIMENSIONS.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  Split by {d.label.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {period === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From"
              className="w-40"
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To"
              className="w-40"
            />
          </div>
        )}

        {DIMENSIONS.filter((d) => dimValues[d.key].length > 1).map((d) => {
          const all = dimValues[d.key];
          const active = filters[d.key].length ? filters[d.key] : all;
          return (
            <div key={d.key} className="flex flex-wrap items-center gap-2">
              <span className="w-14 shrink-0 text-xs text-muted-foreground">{d.label}</span>
              <ToggleGroup
                multiple
                variant="outline"
                size="sm"
                value={active}
                onValueChange={(next) =>
                  setFilters((f) => ({
                    ...f,
                    // "nothing" and "everything" both mean no filter.
                    [d.key]: next.length === 0 || next.length === all.length ? [] : next,
                  }))
                }
                className="flex-wrap"
                aria-label={`Filter by ${d.label.toLowerCase()}`}
              >
                {all.map((key) => (
                  <ToggleGroupItem key={key} value={key}>
                    {label(d.key, key)}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              {filters[d.key].length > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setFilters((f) => ({ ...f, [d.key]: [] }))}
                >
                  Reset
                </Button>
              )}
            </div>
          );
        })}

        {!view ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Nothing to chart</EmptyTitle>
              <EmptyDescription>
                No activity matches the selected period and filters.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <ChartContainer config={view.config} className="aspect-auto h-56 w-full">
              <BarChart data={view.data} margin={{ left: 4, right: 4, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="bucket"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={(v: number) => formatMetric(v, metric)}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.5 }}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <>
                          <span
                            className="size-2.5 shrink-0 rounded-[2px]"
                            style={{
                              backgroundColor: view.config[String(name)]?.color,
                            }}
                            aria-hidden
                          />
                          <span className="flex-1 text-muted-foreground">
                            {view.config[String(name)]?.label ?? name}
                          </span>
                          <span className="font-mono font-medium tabular-nums">
                            {formatMetric(Number(value), metric)}
                          </span>
                        </>
                      )}
                    />
                  }
                />
                {view.series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    stackId="usage"
                    fill={s.color}
                    radius={i === view.series.length - 1 ? [2, 2, 0, 0] : undefined}
                  />
                ))}
              </BarChart>
            </ChartContainer>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{DIMENSIONS.find((d) => d.key === dim)?.label}</TableHead>
                  <TableHead className="text-right">Billable</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {view.series.map((s) => (
                  <TableRow key={s.key}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: s.color }}
                          aria-hidden
                        />
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(s.billable)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatTokens(s.total)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatUsd(s.cost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {view.series.length > 1 && (
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(view.sum.billable)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTokens(view.sum.total)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatUsd(view.sum.cost)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
