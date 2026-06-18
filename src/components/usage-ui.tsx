import { formatTokens } from "@/lib/format";

function barColor(p: number): string {
  if (p >= 90) return "bg-red-500";
  if (p >= 70) return "bg-amber-500";
  return "bg-white";
}

export function UsageBar({ pct }: { pct: number }) {
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className={`h-full rounded-full ${barColor(pct)}`}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

export function MetricCard({
  title,
  subtitle,
  pct,
  used,
  limit,
}: {
  title: string;
  subtitle: string;
  pct: number;
  used: number;
  limit: number;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a0a0a] p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-neutral-400">{title}</h3>
        <span className="text-2xl font-semibold tabular-nums">
          {Math.min(100, pct)}%
        </span>
      </div>
      <p className="mb-3 text-xs text-neutral-500">{subtitle}</p>
      <UsageBar pct={pct} />
      <p className="mt-2 text-xs text-neutral-400 tabular-nums">
        {formatTokens(used)} / {formatTokens(limit)} tokens
      </p>
    </div>
  );
}
