import type { TokenTotals, UsageRecord } from "./types";

/** USD per 1M tokens. Approximate public Claude API list prices; used only for
 *  the optional $ column, not for limit math. */
interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const OPUS: Price = { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 };
const SONNET: Price = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
const HAIKU: Price = { input: 0.8, output: 4, cacheWrite: 1.0, cacheRead: 0.08 };

export function priceFor(model: string | null | undefined): Price | null {
  if (!model) return SONNET; // unknown → sonnet-tier fallback
  const m = model.toLowerCase();
  if (m.includes("fable")) return null; // synthetic test model — not billable
  if (m.includes("opus")) return OPUS;
  if (m.includes("haiku")) return HAIKU;
  if (m.includes("sonnet")) return SONNET;
  return SONNET;
}

/** Cost of one record in USD. Note: cache-creation here uses the write rate;
 *  we do not retain the 5m/1h split so 1h-at-input×2 is approximated. */
export function costUsd(e: UsageRecord): number {
  const p = priceFor(e.model);
  if (!p) return 0;
  return (
    (e.inputTokens * p.input +
      e.outputTokens * p.output +
      e.cacheCreationTokens * p.cacheWrite +
      e.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}

/** Cost of pre-summed totals, assuming a single representative model. */
export function costForTotals(
  totals: TokenTotals,
  model: string | null,
): number {
  const p = priceFor(model);
  if (!p) return 0;
  return (
    (totals.inputTokens * p.input +
      totals.outputTokens * p.output +
      totals.cacheCreationTokens * p.cacheWrite +
      totals.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}
