"use client";

import { useState } from "react";
import { UsageBar } from "@/components/usage-ui";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PastWindow, WindowHistoryDTO } from "@/lib/data";
import { formatTokens } from "@/lib/format";

const KINDS = [
  { key: "sessions", label: "5-hour sessions" },
  { key: "weeks", label: "Weeks" },
] as const;
type Kind = (typeof KINDS)[number]["key"];

const dayFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "Feb 12, 10:00–15:00" for a session, "Feb 5 – Feb 12" for a week (UTC). */
function windowLabel(w: PastWindow, kind: Kind): string {
  const start = new Date(w.start);
  const end = new Date(w.end);
  return kind === "sessions"
    ? `${dayFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`
    : `${dayFmt.format(start)} – ${dayFmt.format(end)}`;
}

const columnKey = (groupId: string | null) => groupId ?? "ungrouped";

/** One column per group that was active in any shown window, busiest first. */
function columnsOf(windows: PastWindow[]) {
  const cols = new Map<string, { key: string; name: string; color: string; tokens: number }>();
  for (const w of windows) {
    for (const g of w.groups) {
      const cur = cols.get(columnKey(g.groupId));
      if (cur) cur.tokens += g.tokens;
      else
        cols.set(columnKey(g.groupId), {
          key: columnKey(g.groupId),
          name: g.name,
          color: g.color,
          tokens: g.tokens,
        });
    }
  }
  return [...cols.values()].sort((a, b) => b.tokens - a.tokens);
}

/**
 * Past limit windows, group by group — the "how did last session/week go"
 * counterpart to the live card. Each group's cell reads like the live Groups
 * table: usage against its 1/maxGroups budget slice of the account limit, with
 * the excess spelled out past 100%. The limit is calibrated from the currently
 * open window (tokens vs the utilization Claude reports for it), since Claude
 * reports nothing for windows that already closed.
 */
export function WindowHistory({ history }: { history: WindowHistoryDTO }) {
  const [kind, setKind] = useState<Kind>("sessions");
  const windows = history[kind];
  const columns = columnsOf(windows);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>Past windows</CardTitle>
          <CardDescription>
            Completed {kind === "sessions" ? "5-hour" : "weekly"} windows, newest first. Billable
            tokens (cache reads excluded) and each group&apos;s usage against its budget slice of
            the account limit — past 100% means it ate into another group&apos;s share.
          </CardDescription>
        </div>
        <Select
          value={kind}
          onValueChange={(v) => {
            if (v) setKind(v);
          }}
          items={KINDS.map((k) => ({ value: k.key, label: k.label }))}
        >
          <SelectTrigger size="sm" aria-label="Window">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k.key} value={k.key}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>

      <CardContent>
        {windows.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>Nothing behind us yet</EmptyTitle>
              <EmptyDescription>
                No completed {kind === "sessions" ? "5-hour" : "weekly"} window has any recorded
                activity.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Window (UTC)</TableHead>
                <TableHead>Total</TableHead>
                {columns.map((c) => (
                  <TableHead key={c.key}>
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: c.color }}
                        aria-hidden
                      />
                      {c.name}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {windows.map((w) => (
                <TableRow key={w.start}>
                  <TableCell className="whitespace-nowrap font-medium">
                    {windowLabel(w, kind)}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatTokens(w.tokens)}
                  </TableCell>
                  {columns.map((c) => {
                    const g = w.groups.find((x) => columnKey(x.groupId) === c.key);
                    return (
                      <TableCell key={c.key}>
                        {g ? (
                          <div className="flex min-w-36 items-center gap-3">
                            <UsageBar pct={g.budgetPct} className="w-16 shrink-0" />
                            <span className="tabular-nums">
                              <span
                                className={
                                  g.budgetPct > 100 ? "font-medium text-destructive" : "font-medium"
                                }
                              >
                                {g.budgetPct}%
                              </span>
                              {g.budgetPct > 100 && (
                                <span className="text-destructive"> (+{g.budgetPct - 100})</span>
                              )}
                              <span className="text-muted-foreground">
                                {" "}
                                · {formatTokens(g.tokens)}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
