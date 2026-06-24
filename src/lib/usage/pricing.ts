import type { TokenTotals, UsageRecord } from "./types";

/** USD per 1M tokens. Public Claude API list prices from
 *  https://platform.claude.com/docs/en/about-claude/pricing — used only for the
 *  optional $ column, not for limit math.
 *
 *  `cacheWrite` uses the 5-minute write rate (1.25× base input); we don't retain
 *  the 5m/1h split, and Claude Code writes 5m caches, so 1h-at-2× is approximated.
 *  `cacheRead` is the cache-hit rate (0.1× base input). */
interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

// Opus 4.5 and later (4.5 / 4.6 / 4.7 / 4.8): the current Opus tier.
const OPUS_CURRENT: Price = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };
// Opus 4.0 / 4.1 (deprecated/retired): the legacy Opus tier.
const OPUS_LEGACY: Price = { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };
// Sonnet 3.5 / 4 / 4.5 / 4.6 all share one rate.
const SONNET: Price = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
// Haiku 4.5 (current tier).
const HAIKU_CURRENT: Price = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };
// Haiku 3.5 (legacy tier).
const HAIKU_LEGACY: Price = { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 };

/** First major.minor pair after the family word ("opus-4-8" → 4.8). Minor is a
 *  single digit in practice, so major + minor/10 orders versions correctly. */
function versionOf(m: string): number | null {
  const v = m.match(/(\d+)[._-](\d+)/);
  return v ? Number(v[1]) + Number(v[2]) / 10 : null;
}

export function priceFor(model: string | null | undefined): Price | null {
  if (!model) return SONNET; // unknown → sonnet-tier fallback
  const m = model.toLowerCase();
  if (m.includes("fable") || m.includes("mythos")) return null; // synthetic test models — not billable
  const v = versionOf(m);
  if (m.includes("opus")) return v !== null && v < 4.5 ? OPUS_LEGACY : OPUS_CURRENT;
  if (m.includes("haiku")) return v !== null && v < 4.5 ? HAIKU_LEGACY : HAIKU_CURRENT;
  if (m.includes("sonnet")) return SONNET;
  return SONNET;
}

/** The four billable token counts shared by records, totals and aggregate rows. */
type TokenCounts = Pick<
  TokenTotals,
  "inputTokens" | "outputTokens" | "cacheCreationTokens" | "cacheReadTokens"
>;

/** USD cost of a set of token counts under one model's list price. */
export function costForTokens(t: TokenCounts, model: string | null): number {
  const p = priceFor(model);
  if (!p) return 0;
  return (
    (t.inputTokens * p.input +
      t.outputTokens * p.output +
      t.cacheCreationTokens * p.cacheWrite +
      t.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}

/** Cost of one record in USD. */
export function costUsd(e: UsageRecord): number {
  return costForTokens(e, e.model);
}

/** Cost of pre-summed totals, assuming a single representative model. */
export function costForTotals(
  totals: TokenTotals,
  model: string | null,
): number {
  return costForTokens(totals, model);
}
