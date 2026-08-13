export type PlanId = "pro" | "max5" | "max20" | "custom";

export interface PlanLimits {
  sessionLimitTokens: number;
  weeklyLimitTokens: number;
}

/**
 * Per-plan default limits. Anthropic's real subscription limits are opaque
 * compute-hour caps over a rolling 5h window plus a weekly window; these
 * token figures are community-derived ESTIMATES (per ccusage /
 * Claude-Code-Usage-Monitor) used as denominators for the % displays. Users
 * can override them in Settings (plan = "custom").
 */
export const PLAN_PRESETS: Record<Exclude<PlanId, "custom">, PlanLimits> = {
  pro: { sessionLimitTokens: 19_000, weeklyLimitTokens: 475_000 },
  max5: { sessionLimitTokens: 88_000, weeklyLimitTokens: 2_200_000 },
  max20: { sessionLimitTokens: 220_000, weeklyLimitTokens: 5_500_000 },
};

export function limitsForPlan(plan: PlanId, custom?: PlanLimits): PlanLimits {
  if (plan === "custom") {
    return custom ?? PLAN_PRESETS.max5;
  }
  return PLAN_PRESETS[plan];
}

/** Percent of a limit, clamped to [0, ∞) and rounded. 0 limit → 0. */
export function pct(used: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.max(0, Math.round((used / limit) * 100));
}
