"use client";

import { useState } from "react";
import { Tabs } from "@/components/dashboard/Tabs";
import { formatTokens } from "@/lib/format";
import type { DashboardDTO } from "@/lib/data";
import type { TokenTotals, UsagePeriod } from "@/lib/usage";

const billable = (t: TokenTotals) =>
  t.inputTokens + t.outputTokens + t.cacheCreationTokens;

/** One headline usage figure (billable, with the full total + split beneath). */
function TotalCard({ title, totals }: { title: string; totals: TokenTotals }) {
  const bill = billable(totals);
  const cache = totals.cacheCreationTokens + totals.cacheReadTokens;
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
      <h3 className="text-sm font-medium text-neutral-400">{title}</h3>
      <p className="mt-2 truncate text-3xl font-semibold tabular-nums">
        {formatTokens(bill)}
      </p>
      <p className="mt-1 text-xs text-neutral-500">billable tokens</p>
      <dl className="mt-3 flex flex-col gap-1 text-xs tabular-nums text-neutral-400">
        <Row label="Total (incl. cache)" value={totals.totalTokens} />
        <Row label="Input" value={totals.inputTokens} />
        <Row label="Output" value={totals.outputTokens} />
        <Row label="Cache" value={cache} />
      </dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-neutral-300">{formatTokens(value)}</dd>
    </div>
  );
}

/** A ledger table of consumption per period (day or month). */
function LedgerTable({ rows }: { rows: UsagePeriod[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-neutral-500">
        No usage recorded yet.
      </p>
    );
  }
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full text-sm tabular-nums">
        <thead className="sticky top-0 bg-[#0a0a0a]">
          <tr className="border-b border-white/10 text-xs text-neutral-500">
            <th className="py-2 pr-2 text-left font-medium">Period</th>
            <th className="px-2 py-2 text-right font-medium">Billable</th>
            <th className="px-2 py-2 text-right font-medium">In</th>
            <th className="px-2 py-2 text-right font-medium">Out</th>
            <th className="px-2 py-2 text-right font-medium">Cache</th>
            <th className="py-2 pl-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const cache = r.totals.cacheCreationTokens + r.totals.cacheReadTokens;
            return (
              <tr
                key={r.key}
                className="border-b border-white/5 text-neutral-300 last:border-0"
              >
                <td className="py-2 pr-2 text-left text-neutral-400">{r.label}</td>
                <td className="px-2 py-2 text-right">
                  {formatTokens(billable(r.totals))}
                </td>
                <td className="px-2 py-2 text-right text-neutral-400">
                  {formatTokens(r.totals.inputTokens)}
                </td>
                <td className="px-2 py-2 text-right text-neutral-400">
                  {formatTokens(r.totals.outputTokens)}
                </td>
                <td className="px-2 py-2 text-right text-neutral-400">
                  {formatTokens(cache)}
                </td>
                <td className="py-2 pl-2 text-right">
                  {formatTokens(r.totals.totalTokens)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "How much was used" panel: Today / This month / All-time cards plus a
 *  per-day / per-month ledger of the whole tracked history. */
export function UsageTotals({ dash }: { dash: DashboardDTO }) {
  const [grain, setGrain] = useState<"day" | "month">("day");
  const ledger = grain === "day" ? dash.dailyLedger : dash.monthlyLedger;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-neutral-400">Usage totals</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <TotalCard title="Today" totals={dash.usageTotals.today} />
        <TotalCard title="This month" totals={dash.usageTotals.month} />
        <TotalCard title="All time" totals={dash.usageTotals.allTime} />
      </div>

      <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-neutral-400">
            Consumption ledger
          </h3>
          <Tabs
            size="sm"
            ariaLabel="Ledger granularity"
            value={grain}
            onChange={setGrain}
            options={[
              { value: "day", label: "By day", count: dash.dailyLedger.length },
              { value: "month", label: "By month", count: dash.monthlyLedger.length },
            ]}
          />
        </div>
        <LedgerTable rows={ledger} />
      </div>
    </section>
  );
}
