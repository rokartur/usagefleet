"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ShareDonut } from "@/components/charts/ShareDonut";
import { TokenBarChart } from "@/components/charts/TokenBarChart";
import { UsageTimelineChart } from "@/components/charts/UsageTimelineChart";
import { colorAt } from "@/components/charts/chart-theme";
import { DeviceTable } from "@/components/dashboard/DeviceTable";
import { GroupTable } from "@/components/dashboard/GroupTable";
import { KpiRow } from "@/components/dashboard/KpiRow";
import { ModelTable } from "@/components/dashboard/ModelTable";
import { SourceTable } from "@/components/dashboard/SourceTable";
import { Tabs } from "@/components/dashboard/Tabs";
import { UsageTotals } from "@/components/dashboard/UsageTotals";
import type { DashboardDTO } from "@/lib/data";
import { formatRelative, formatTokens } from "@/lib/format";

const POLL_MS = 5000;

type Tab = "group" | "device" | "source" | "model";

export function LiveDashboard({ initial }: { initial: DashboardDTO }) {
  const [dash, setDash] = useState<DashboardDTO>(initial);
  const [lastOk, setLastOk] = useState(() => Date.now());
  // `now` advances once a second (below) so the staleness check stays a pure
  // read of state during render.
  const [now, setNow] = useState(() => Date.now());
  const [tab, setTab] = useState<Tab>("group");
  // Which rows are expanded (group keys + `dev:<id>` keys share one Set).
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

  const weeklyTotalTokens = dash.weeklyTotals.totalTokens;

  const groupDonut = useMemo(
    () =>
      dash.groups.map((g) => ({
        key: g.groupId ?? "ungrouped",
        name: g.name,
        value: g.weeklyTokens,
        color: g.color,
      })),
    [dash.groups],
  );
  const deviceDonut = useMemo(
    () =>
      dash.devices.map((d, i) => ({
        key: d.deviceId,
        name: d.name,
        value: d.weeklyTokens,
        color: colorAt(i),
      })),
    [dash.devices],
  );
  const modelDonut = useMemo(
    () =>
      dash.models.map((m, i) => ({
        key: m.model,
        name: m.label,
        value: m.billableTokens,
        color: colorAt(i),
      })),
    [dash.models],
  );
  const sourceDonut = useMemo(
    () =>
      dash.sources.map((s, i) => ({
        key: s.source,
        name: s.label,
        value: s.weeklyTokens,
        color: colorAt(i),
      })),
    [dash.sources],
  );

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

  const donut =
    tab === "group"
      ? groupDonut
      : tab === "device"
        ? deviceDonut
        : tab === "source"
          ? sourceDonut
          : modelDonut;

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiRow dash={dash} />
      </div>

      <UsageTimelineChart
        timeline={dash.timeline}
        timelineHourly={dash.timelineHourly}
        timeline30d={dash.timeline30d}
        timelineMonthly={dash.timelineMonthly}
        groups={dash.groups}
        models={dash.models}
      />

      <UsageTotals dash={dash} />

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-400">Breakdown</h2>
          <Tabs
            ariaLabel="Breakdown dimension"
            value={tab}
            onChange={setTab}
            options={[
              { value: "group", label: "By group", count: dash.groups.length },
              { value: "device", label: "By device", count: dash.devices.length },
              { value: "source", label: "By source", count: dash.sources.length },
              { value: "model", label: "By model", count: dash.models.length },
            ]}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr]">
          <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
            <ShareDonut
              data={donut}
              centerLabel="weekly"
              centerValue={formatTokens(weeklyTotalTokens)}
            />
          </div>
          <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
            {tab === "group" && (
              <GroupTable
                groups={dash.groups}
                expanded={expanded}
                onToggle={toggleRow}
              />
            )}
            {tab === "device" && (
              <DeviceTable
                devices={dash.devices}
                expanded={expanded}
                onToggle={toggleRow}
              />
            )}
            {tab === "source" && (
              <SourceTable
                sources={dash.sources}
                expanded={expanded}
                onToggle={toggleRow}
              />
            )}
            {tab === "model" && <ModelTable models={dash.models} />}
          </div>
        </div>

        {tab === "model" && dash.models.length > 0 && (
          <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
            <h3 className="mb-3 text-sm font-medium text-neutral-400">
              Models by billable tokens · weekly
            </h3>
            <TokenBarChart data={modelDonut} />
          </div>
        )}
      </section>

      <p className="text-xs text-neutral-500">
        The 5-hour and weekly percentages up top are Claude&apos;s own account
        utilization (reported by the collector). Each group is budgeted half the
        account limit, so a group&apos;s percentage is measured against that
        half — a group can read 100% while the account is at 50%, warning you not
        to starve the other group. Per-device numbers distribute the account
        total by local token activity (billable tokens, excluding cache reads).
      </p>
    </div>
  );
}
