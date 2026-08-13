import { activeBlock } from "./blocks";
import { foldAndSum } from "./fold";
import { pct } from "./limits";
import { modelBreakdown, type ModelUsage } from "./models";
import { EMPTY_TOTALS, type TokenTotals, type UsageRecord } from "./types";
import { filterByWindow, weekWindowStart } from "./window";

export interface LimitConfig {
  sessionLimitTokens: number;
  weeklyLimitTokens: number;
  weekResetWeekday: number;
  weekResetHourUtc: number;
}

export interface UsageSlice {
  session: TokenTotals;
  weekly: TokenTotals;
  sessionPct: number;
  weeklyPct: number;
}

export interface GroupUsage extends UsageSlice {
  groupId: string | null;
  name: string;
  color: string;
  /** Which models the group used (and how many tokens), over the weekly window. */
  models: ModelUsage[];
}

export interface DashboardUsage {
  overall: UsageSlice;
  groups: GroupUsage[];
  weekStart: Date;
  sessionStart: Date | null;
  sessionEnd: Date | null;
}

export interface GroupMeta {
  id: string;
  name: string;
  color: string;
}

/**
 * Build the full dashboard model. The 5h session window is ACCOUNT-WIDE (one
 * active block across all devices, matching Anthropic's per-account limit);
 * each group's session usage is its share within that shared window. The
 * weekly window is likewise account-wide.
 */
export function computeDashboardUsage(
  events: UsageRecord[],
  groups: GroupMeta[],
  cfg: LimitConfig,
  now: Date,
): DashboardUsage {
  const block = activeBlock(events, now);
  const weekStart = weekWindowStart(now, cfg.weekResetWeekday, cfg.weekResetHourUtc);

  const sliceFor = (subset: UsageRecord[]): UsageSlice => {
    const session = block
      ? foldAndSum(filterByWindow(subset, block.start, now))
      : { ...EMPTY_TOTALS };
    const weekly = foldAndSum(filterByWindow(subset, weekStart, now));
    return {
      session,
      weekly,
      sessionPct: pct(session.totalTokens, cfg.sessionLimitTokens),
      weeklyPct: pct(weekly.totalTokens, cfg.weeklyLimitTokens),
    };
  };

  const byGroup = new Map<string | null, UsageRecord[]>();
  for (const e of events) {
    const g = e.groupId ?? null;
    const arr = byGroup.get(g);
    if (arr) arr.push(e);
    else byGroup.set(g, [e]);
  }

  // Models a group used over the weekly window (broader than the 5h session).
  const modelsFor = (subset: UsageRecord[]): ModelUsage[] =>
    modelBreakdown(filterByWindow(subset, weekStart, now));

  const groupUsages: GroupUsage[] = groups.map((g) => {
    const subset = byGroup.get(g.id) ?? [];
    return {
      groupId: g.id,
      name: g.name,
      color: g.color,
      ...sliceFor(subset),
      models: modelsFor(subset),
    };
  });

  const ungrouped = byGroup.get(null) ?? [];
  if (ungrouped.length > 0) {
    groupUsages.push({
      groupId: null,
      name: "Ungrouped",
      color: "#94a3b8",
      ...sliceFor(ungrouped),
      models: modelsFor(ungrouped),
    });
  }

  return {
    overall: sliceFor(events),
    groups: groupUsages,
    weekStart,
    sessionStart: block?.start ?? null,
    sessionEnd: block?.end ?? null,
  };
}
