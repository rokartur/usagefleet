"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ResetCountdown } from "@/components/ResetCountdown";
import { GroupTable } from "@/components/dashboard/GroupTable";
import { UsageBar } from "@/components/usage-ui";
import type { DashboardDTO, ModelLimitDTO, SpendPeriod } from "@/lib/data";
import { formatRelative, formatTokens, formatUsd } from "@/lib/format";
import { billableTokens } from "@/lib/usage";

/** Display label for a limit-window key: "5h" → "5-hour", "7d" → "weekly". */
function windowLabel(window: string): string {
  if (window === "5h") return "5-hour";
  if (window === "7d") return "weekly";
  return window;
}

const POLL_MS = 5000;

/** One official limit card: Claude's own account utilization for a window. */
function OfficialCard({
  title,
  pct,
  resetsAt,
}: {
  title: string;
  pct: number;
  resetsAt: string | null;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-neutral-400">{title}</h3>
        <span className="text-3xl font-semibold tabular-nums">
          {Math.min(100, pct)}%
        </span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        <ResetCountdown resetsAt={resetsAt} />
      </p>
      <UsageBar pct={pct} />
    </div>
  );
}

/** One per-model official limit: Claude's own utilization bar up top, then the
 *  per-group split underneath — same presentation as the session split. */
function ModelLimitCard({ limit }: { limit: ModelLimitDTO }) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-neutral-400">
          {limit.label}
          <span className="ml-2 text-xs text-neutral-600">
            {windowLabel(limit.window)} limit
          </span>
        </h3>
        <span className="text-3xl font-semibold tabular-nums">{limit.pct}%</span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">
        <ResetCountdown resetsAt={limit.resetsAt} />
      </p>
      <UsageBar pct={limit.pct} />
      {limit.groups.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 border-t border-white/5 pt-3">
          {limit.groups.map((g) => (
            <li
              key={g.groupId ?? "ungrouped"}
              className="flex items-center gap-3 text-sm"
            >
              <span className="flex w-32 min-w-0 items-center gap-1.5 text-neutral-300">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: g.color }}
                />
                <span className="truncate">{g.name}</span>
              </span>
              <div className="w-28">
                <UsageBar pct={g.pct} />
              </div>
              <span className="tabular-nums text-neutral-400">
                ~{g.pct}% · {formatTokens(g.tokens)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SpendRow({ label, period }: { label: string; period: SpendPeriod }) {
  return (
    <tr className="border-t border-white/10 text-neutral-300">
      <td className="py-3 pr-2 text-left text-neutral-400">{label}</td>
      <td className="px-2 py-3 text-right tabular-nums">
        {formatTokens(billableTokens(period.totals))}
      </td>
      <td className="px-2 py-3 text-right tabular-nums text-neutral-400">
        {formatTokens(period.totals.totalTokens)}
      </td>
      <td
        className="py-3 pl-2 text-right tabular-nums text-neutral-200"
        title="At public API list prices"
      >
        {formatUsd(period.costUsd)}
      </td>
    </tr>
  );
}

/** Money spent this week (weekly window) and this calendar month (UTC). */
function SpendTable({ dash }: { dash: DashboardDTO }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wide text-neutral-500">
          <th className="pb-2 pr-2 text-left font-medium">Period</th>
          <th className="px-2 pb-2 text-right font-medium">Billable</th>
          <th className="px-2 pb-2 text-right font-medium">Total</th>
          <th className="pb-2 pl-2 text-right font-medium">Cost</th>
        </tr>
      </thead>
      <tbody>
        <SpendRow label="This week" period={dash.spend.week} />
        <SpendRow label="This month" period={dash.spend.month} />
      </tbody>
    </table>
  );
}

export function LiveDashboard({ initial }: { initial: DashboardDTO }) {
  const [dash, setDash] = useState<DashboardDTO>(initial);
  const [lastOk, setLastOk] = useState(() => Date.now());
  // `now` advances once a second (below) so the staleness check stays a pure
  // read of state during render.
  const [now, setNow] = useState(() => Date.now());
  // Which group rows are expanded (groupId or "ungrouped").
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const reqIdRef = useRef(0);

  const toggleRow = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    const myId = ++reqIdRef.current;
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store", signal });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      // Only the most-recently-started request may write state (no stale races).
      if (res.ok && myId === reqIdRef.current) {
        setDash((await res.json()) as DashboardDTO);
        setLastOk(Date.now());
      }
    } catch {
      /* transient network/abort — keep last good data; staleness shows below */
    }
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    const id = setInterval(() => refresh(ac.signal), POLL_MS);
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(ac.signal);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      ac.abort();
      clearInterval(id);
      clearInterval(ticker);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const stale = now - lastOk > 3 * POLL_MS;

  if (!dash.connected) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-6">
          <h2 className="font-medium text-white">No usage reported yet</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Install the collector and run it on a machine where you&apos;re signed
            into Claude Code. It auto-detects your subscription (or API key) and
            reports your real 5-hour and weekly limit usage — no keys to paste
            here. See <code>collector/README.md</code>.
          </p>
        </div>
      </div>
    );
  }

  const sourceLabel =
    dash.source === "sub"
      ? "subscription"
      : dash.source === "api"
        ? "API key"
        : "—";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Live from Claude · {sourceLabel}
          {dash.reportedAt
            ? ` · updated ${formatRelative(new Date(dash.reportedAt))}`
            : ""}
          <span className="ml-2 inline-flex items-center gap-1 text-neutral-500">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stale ? "bg-amber-400" : "animate-pulse bg-emerald-400"
              }`}
            />
            {stale ? "reconnecting…" : "live"}
          </span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <OfficialCard
          title="5-hour session"
          resetsAt={dash.fiveHourResetsAt}
          pct={dash.fiveHourPct}
        />
        <OfficialCard
          title="Weekly"
          resetsAt={dash.sevenDayResetsAt}
          pct={dash.sevenDayPct}
        />
      </div>

      {dash.modelLimits.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium text-neutral-400">Model limits</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {dash.modelLimits.map((m) => (
              <ModelLimitCard key={`${m.model}-${m.window}`} limit={m} />
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-neutral-400">Groups</h2>
        <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
          <GroupTable
            groups={dash.groups}
            expanded={expanded}
            onToggle={toggleRow}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-neutral-400">Spend</h2>
        <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
          <SpendTable dash={dash} />
          <p className="mt-3 text-xs text-neutral-500">
            &quot;This week&quot; follows the weekly limit window;
            &quot;this month&quot; is the UTC calendar month. Cost is estimated
            at public API list prices, priced per model.
          </p>
        </div>
      </section>

      <p className="text-xs text-neutral-500">
        The 5-hour, weekly and per-model percentages up top are Claude&apos;s own
        account utilization (reported by the collector). Each group is budgeted
        half the account limit, so a group&apos;s percentage is measured against
        that half — a group can read 100% while the account is at 50%, warning
        you not to starve the other group.
      </p>
    </div>
  );
}
