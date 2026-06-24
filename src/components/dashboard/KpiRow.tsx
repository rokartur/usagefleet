import { ResetCountdown } from "@/components/ResetCountdown";
import { UsageBar } from "@/components/usage-ui";
import { CHART_PALETTE } from "@/components/charts/chart-theme";
import { formatTokens } from "@/lib/format";
import type { DashboardDTO } from "@/lib/data";

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

function StatCard({
  title,
  value,
  children,
}: {
  title: string;
  value: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
      <h3 className="text-sm font-medium text-neutral-400">{title}</h3>
      <p className="mt-2 truncate text-3xl font-semibold tabular-nums">{value}</p>
      <div className="mt-1 text-xs text-neutral-500">{children}</div>
    </div>
  );
}

/** Tiny three-segment bar showing the input / output / cache split of a total. */
function SplitBar({ a, b, c }: { a: number; b: number; c: number }) {
  const sum = a + b + c;
  if (sum <= 0) return null;
  const seg = (v: number, color: string) =>
    v > 0 ? (
      <span style={{ width: `${(v / sum) * 100}%`, backgroundColor: color }} />
    ) : null;
  return (
    <span className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-white/10">
      {seg(a, CHART_PALETTE[0])}
      {seg(b, CHART_PALETTE[1])}
      {seg(c, "#525252")}
    </span>
  );
}

/** KPI row: the two official limit cards + weekly tokens, devices, top model. */
export function KpiRow({ dash }: { dash: DashboardDTO }) {
  const wt = dash.weeklyTotals;
  const cache = wt.cacheCreationTokens + wt.cacheReadTokens;
  const totalBillable = dash.models.reduce((s, m) => s + m.billableTokens, 0);
  const top = dash.models[0];
  const topShare =
    top && totalBillable > 0
      ? Math.round((top.billableTokens / totalBillable) * 100)
      : 0;

  return (
    <>
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
      <StatCard title="Weekly tokens" value={formatTokens(wt.totalTokens)}>
        in {formatTokens(wt.inputTokens)} · out {formatTokens(wt.outputTokens)} ·
        cache {formatTokens(cache)}
        <SplitBar a={wt.inputTokens} b={wt.outputTokens} c={cache} />
      </StatCard>
      <StatCard title="Active devices" value={String(dash.devices.length)}>
        {dash.idleDeviceCount > 0
          ? `${dash.idleDeviceCount} idle`
          : "all reporting"}
      </StatCard>
      <StatCard title="Top model" value={top ? top.label : "—"}>
        {top
          ? `${formatTokens(top.billableTokens)} · ${topShare}% of weekly`
          : "no activity yet"}
      </StatCard>
    </>
  );
}
