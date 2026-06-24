"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { ResetCountdown } from "@/components/ResetCountdown";
import { UsageBar } from "@/components/usage-ui";
import type { DashboardDTO } from "@/lib/data";
import { formatRelative, formatTokens } from "@/lib/format";
import type { ModelUsage } from "@/lib/usage";

const POLL_MS = 5000;

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

/** Per-model token breakdown shown when a group row is expanded. Tokens are the
 *  weekly-window figures; "billable" = input + output + cache-creation (the same
 *  measure that drives the group share), with the raw input/output/cache split
 *  shown for precision. */
function ModelBreakdown({ models }: { models: ModelUsage[] }) {
  if (models.length === 0) {
    return (
      <p className="px-2 text-xs text-neutral-500">
        No model activity in the weekly window yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="px-2 pb-1 text-[10px] uppercase tracking-wide text-neutral-600">
        Models · weekly · billable tokens
      </p>
      {models.map((m) => (
        <div
          key={m.model}
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 rounded px-2 py-1.5 hover:bg-white/[0.02]"
        >
          <span className="font-medium text-neutral-200">{m.label}</span>
          <span className="tabular-nums text-neutral-400">
            {formatTokens(m.billableTokens)}
            <span className="ml-2 text-xs text-neutral-600">
              in {formatTokens(m.totals.inputTokens)} · out{" "}
              {formatTokens(m.totals.outputTokens)} · cache{" "}
              {formatTokens(
                m.totals.cacheCreationTokens + m.totals.cacheReadTokens,
              )}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

export function LiveDashboard({ initial }: { initial: DashboardDTO }) {
  const [dash, setDash] = useState<DashboardDTO>(initial);
  const [lastOk, setLastOk] = useState(() => Date.now());
  // `now` advances once a second (below) so the staleness check stays a pure
  // read of state during render — calling Date.now() in the render body is
  // impure (flagged by react-hooks/purity) and can render unstable results.
  const [now, setNow] = useState(() => Date.now());
  // Which group rows are expanded to reveal their per-model token breakdown.
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
    // Advance `now` every second so the staleness indicator updates even when
    // polls are failing (failed polls don't call setDash).
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    // Single source (visibilitychange) avoids the focus+visibility double fire.
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

      <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
        <h2 className="mb-1 text-sm font-medium text-neutral-400">By group</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Account totals split across groups by each group&apos;s share of local
          activity (billable tokens, excluding cache reads). Click a group to see
          which models it used.
        </p>
        {dash.groups.length === 0 ? (
          <p className="text-sm text-neutral-500">
            No device activity in the current windows yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="pb-2 font-medium">Group</th>
                <th className="pb-2 font-medium">Session</th>
                <th className="pb-2 font-medium">Weekly</th>
              </tr>
            </thead>
            <tbody>
              {dash.groups.map((g) => {
                const key = g.groupId ?? "ungrouped";
                const isOpen = expanded.has(key);
                return (
                  <Fragment key={key}>
                    <tr className="border-t border-white/10">
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => toggleRow(key)}
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
                            {g.models.length} model
                            {g.models.length === 1 ? "" : "s"}
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
                          <ModelBreakdown models={g.models} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-neutral-500">
        Session and weekly percentages are Claude&apos;s own utilization figures
        (reported by the collector). Per-group numbers distribute those totals by
        local token activity.
      </p>
    </div>
  );
}
