import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { InstallCommand } from "@/components/InstallCommand";
import { ResetCountdown } from "@/components/ResetCountdown";
import { Button } from "@/components/ui/button";
import { GroupTable } from "@/components/dashboard/GroupTable";
import { UsageBar } from "@/components/usage-ui";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardDTO, ModelLimitDTO, SpendPeriod } from "@/lib/data";
import { formatRelative, formatTokens, formatUsd } from "@/lib/format";
import { TOKEN_PLACEHOLDER } from "@/lib/install-command";
import { cn } from "@/lib/utils";
import { billableTokens } from "@/lib/usage";

/** Display label for a limit-window key: "5h" → "5-hour", "7d" → "weekly". */
function windowLabel(window: string): string {
  if (window === "5h") return "5-hour";
  if (window === "7d") return "weekly";
  return window;
}

const POLL_MS = 5000;
/** The collector reports limits every 5 min; past three missed reports the
 *  numbers below are history, not "live" — say so instead of pulsing green. */
const DATA_STALE_MS = 15 * 60 * 1000;

/** Colored dot used for a group's identity across cards and tables. */
function GroupDot({ color }: { color: string }) {
  return (
    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden />
  );
}

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
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{Math.min(100, pct)}%</CardTitle>
        <CardAction>
          <Badge variant="outline" className="font-normal">
            <ResetCountdown resetsAt={resetsAt} />
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <UsageBar pct={pct} className="[&_[data-slot=progress-track]]:h-2" />
      </CardContent>
    </Card>
  );
}

/** One per-model official limit: Claude's account-wide figure for the model,
 *  then the per-group split — each row is that group's usage against its own
 *  slice (1/group count), the same budget-relative measure as the group table. */
function ModelLimitCard({ limit }: { limit: ModelLimitDTO }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {limit.label}
          <Badge variant="secondary" className="font-normal">
            {windowLabel(limit.window)} limit
          </Badge>
        </CardTitle>
        <CardDescription>
          <ResetCountdown resetsAt={limit.resetsAt} />
        </CardDescription>
        <CardAction className="text-right">
          <div className="text-2xl tabular-nums">{Math.min(100, limit.pct)}%</div>
          <div className="text-xs text-muted-foreground">account</div>
        </CardAction>
      </CardHeader>
      <CardContent>
        {limit.groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No group activity in this window.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {limit.groups.map((g) => (
              <li key={g.groupId ?? "ungrouped"} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <GroupDot color={g.color} />
                    <span className="truncate">{g.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-medium">{g.budgetPct}%</span>
                    <span className="text-muted-foreground"> · {formatTokens(g.tokens)}</span>
                  </span>
                </div>
                <UsageBar pct={g.budgetPct} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SpendRow({ label, period }: { label: string; period: SpendPeriod }) {
  return (
    <TableRow>
      <TableCell className="text-muted-foreground">{label}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatTokens(billableTokens(period.totals))}
      </TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {formatTokens(period.totals.totalTokens)}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {formatUsd(period.costUsd)}
      </TableCell>
    </TableRow>
  );
}

/** What the dashboard needs to tell a fresh account which step it is on.
 *  `reportedEver` is any authenticated collector call (see devices.lastSeenAt),
 *  which separates "installer never ran" from "runs, but found no Claude
 *  login" — the two failures that look identical from an empty dashboard. */
export interface SetupState {
  deviceName: string | null;
  reportedEver: boolean;
}

function Step({
  n,
  title,
  state,
  children,
}: {
  n: number;
  title: string;
  state: "done" | "now" | "waiting";
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 border-t py-4">
      <span
        className={cn(
          "mt-0.5 w-4 shrink-0 text-sm tabular-nums",
          state === "now" ? "text-foreground" : "text-muted-foreground",
        )}
        aria-hidden
      >
        {state === "done" ? <CheckIcon className="size-4 text-emerald-500" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <p className={cn("text-sm", state === "waiting" && "text-muted-foreground")}>{title}</p>
        {children}
      </div>
      <span className="shrink-0 text-sm text-muted-foreground">
        {state === "done" ? "done" : state === "now" ? "now" : "waiting"}
      </span>
    </li>
  );
}

/** The whole dashboard until the first report lands: which of the three setup
 *  steps you are on, and the exact command for the one you're on. */
function SetupRail({ setup }: { setup: SetupState | null }) {
  const device = setup?.deviceName;
  const machine = device ?? "that machine";
  const reported = setup?.reportedEver ?? false;

  return (
    <section>
      <h2 className="text-sm font-medium">No data yet</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Three steps, about a minute. This page fills in on its own.
      </p>
      <ol className="mt-5 [&>li:last-child]:border-b">
        <Step
          n={1}
          title={device ? `Device added: ${device}` : "Add a device"}
          state={device ? "done" : "now"}
        >
          {!device && (
            <div className="flex flex-col gap-2">
              <Button render={<Link to="/devices" />} className="w-fit">
                Add device
              </Button>
              <p className="text-xs text-muted-foreground">
                One device is one machine you use Claude on. You get its token there.
              </p>
            </div>
          )}
        </Step>

        <Step
          n={2}
          title={`Run the installer on ${machine}`}
          state={reported ? "done" : device ? "now" : "waiting"}
        >
          {device && !reported && (
            <div className="flex flex-col gap-2">
              <InstallCommand token={TOKEN_PLACEHOLDER} />
              <p className="text-xs text-muted-foreground">
                Put in the token you copied when you added {machine}. Lost it? Tokens are shown
                once, so add the device again on{" "}
                <Link to="/devices" className="underline underline-offset-2">
                  Devices
                </Link>
                .
              </p>
            </div>
          )}
        </Step>

        <Step n={3} title="First usage report" state={reported ? "now" : "waiting"}>
          <p className="text-xs text-muted-foreground">
            {reported ? (
              <>
                {machine} is reporting, but no Claude limits came with it yet. Run{" "}
                <code className="font-mono">usagefleet status</code> there: it prints whether it
                found your Claude login.
              </>
            ) : (
              <>
                Arrives within a minute of the installer finishing, then every five. Your 5-hour and
                weekly numbers replace this list.
              </>
            )}
          </p>
        </Step>
      </ol>
    </section>
  );
}

export function LiveDashboard({
  initial,
  setup,
}: {
  initial: DashboardDTO;
  setup: SetupState | null;
}) {
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

  const pollDown = now - lastOk > 3 * POLL_MS;
  const reportAge = dash.reportedAt ? now - Date.parse(dash.reportedAt) : 0;
  const stale = pollDown || reportAge > DATA_STALE_MS;
  const statusLabel = pollDown ? "reconnecting…" : stale ? "collector offline" : "live";

  if (!dash.connected) return <SetupRail setup={setup} />;

  const sourceLabel =
    dash.source === "sub" ? "subscription" : dash.source === "api" ? "API key" : "—";

  return (
    <div className="flex flex-col gap-6">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <Badge variant="secondary" className="font-normal">
          <span
            className={cn(
              "size-1.5 rounded-full",
              stale ? "bg-amber-500" : "animate-pulse bg-emerald-500",
            )}
            aria-hidden
          />
          {statusLabel}
        </Badge>
        Live from Claude · {sourceLabel}
        {dash.reportedAt ? ` · updated ${formatRelative(new Date(dash.reportedAt))}` : ""}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <OfficialCard
          title="5-hour session"
          resetsAt={dash.fiveHourResetsAt}
          pct={dash.fiveHourPct}
        />
        <OfficialCard title="Weekly" resetsAt={dash.sevenDayResetsAt} pct={dash.sevenDayPct} />
      </div>

      {dash.modelLimits.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {dash.modelLimits.map((m) => (
            <ModelLimitCard key={`${m.model}-${m.window}`} limit={m} />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Groups</CardTitle>
          <CardDescription>
            Each group&apos;s share of the current 5-hour and weekly windows.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GroupTable groups={dash.groups} expanded={expanded} onToggle={toggleRow} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spend</CardTitle>
          <CardDescription>
            &quot;This week&quot; follows the weekly limit window; &quot;this month&quot; is the UTC
            calendar month. Cost is estimated at public API list prices, priced per model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead className="text-right">Billable</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <SpendRow label="This week" period={dash.spend.week} />
              <SpendRow label="This month" period={dash.spend.month} />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <p className="max-w-3xl text-xs text-muted-foreground">
        The 5-hour and weekly percentages up top are Claude&apos;s own account utilization (reported
        by the collector). Every per-group percentage — in the table and under each model limit — is
        budget-relative: that group&apos;s usage (split by estimated cost at API list prices)
        measured against its equal slice of the limit (1 / your groups-per-account setting). It hits
        100% when the group has eaten its slice; above 100% it has overrun into the other
        groups&apos; share.
      </p>
    </div>
  );
}
