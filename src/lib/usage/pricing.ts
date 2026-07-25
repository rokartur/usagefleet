import type { TokenTotals, UsageRecord } from "./types";

/** USD per 1M tokens. Public Claude API list prices from
 *  https://platform.claude.com/docs/en/about-claude/pricing — used only for the
 *  optional $ column, not for limit math.
 *
 *  `cacheWrite` is the 1-hour write rate (2× base input) — Claude Code writes
 *  1h caches exclusively (verified 100% ephemeral_1h across real JSONL history).
 *  The 5m rate is derived as 1.25× base input when the user picks "5m" in
 *  Settings. `cacheRead` is the cache-hit rate (0.1× base input). */
interface Price {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

// Fable 5 / Mythos 5: the frontier tier ($10/$50 per MTok).
const FABLE: Price = { input: 10, output: 50, cacheWrite: 20, cacheRead: 1 };
// Opus 4.5 and later (4.5 / 4.6 / 4.7 / 4.8): the current Opus tier.
const OPUS_CURRENT: Price = { input: 5, output: 25, cacheWrite: 10, cacheRead: 0.5 };
// Opus 4.0 / 4.1 (deprecated/retired): the legacy Opus tier.
const OPUS_LEGACY: Price = { input: 15, output: 75, cacheWrite: 30, cacheRead: 1.5 };
// Sonnet 3.5 / 4 / 4.5 / 4.6 all share one rate.
const SONNET: Price = { input: 3, output: 15, cacheWrite: 6, cacheRead: 0.3 };
// Haiku 4.5 (current tier).
const HAIKU_CURRENT: Price = { input: 1, output: 5, cacheWrite: 2, cacheRead: 0.1 };
// Haiku 3.5 (legacy tier).
const HAIKU_LEGACY: Price = { input: 0.8, output: 4, cacheWrite: 1.6, cacheRead: 0.08 };

/** First major.minor pair after the family word ("opus-4-8" → 4.8). Minor is a
 *  single digit in practice, so major + minor/10 orders versions correctly. */
function versionOf(m: string): number | null {
  const v = m.match(/(\d+)[._-](\d+)/);
  return v ? Number(v[1]) + Number(v[2]) / 10 : null;
}

/** Anthropic publishes no pricing API, so we read LiteLLM's community-maintained
 *  price map (per-token, incl. cache rates) and fall back to the tiers above for
 *  ids it doesn't list or when the fetch fails. */
const PRICE_SOURCE =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

/** model id (lowercase) → list price, populated by refreshPrices(). */
const fetched = new Map<string, Price>();
let fetchedAt = 0;

/** Refresh the fetched price map, at most once a day per process. Never throws:
 *  a failure leaves whatever we already have (or the hardcoded tiers) in place.
 *  Call before pricing anything; the priceFor() callers are all sync. */
export async function refreshPrices(): Promise<void> {
  if (Date.now() - fetchedAt < 86_400_000) return;
  fetchedAt = Date.now(); // claim the slot first so parallel loads don't stampede
  try {
    const res = await fetch(PRICE_SOURCE, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return;
    const data = (await res.json()) as Record<string, Record<string, unknown>>;
    for (const [id, m] of Object.entries(data)) {
      const input = m?.input_cost_per_token;
      const output = m?.output_cost_per_token;
      if (m?.litellm_provider !== "anthropic") continue;
      if (typeof input !== "number" || typeof output !== "number") continue;
      const write = m.cache_creation_input_token_cost;
      const read = m.cache_read_input_token_cost;
      fetched.set(id.toLowerCase(), {
        input: input * 1e6,
        output: output * 1e6,
        cacheWrite: (typeof write === "number" ? write : input * 1.25) * 1e6,
        cacheRead: (typeof read === "number" ? read : input * 0.1) * 1e6,
      });
    }
  } catch {
    // offline / rate-limited / malformed — keep the previous prices
  }
}

export function priceFor(model: string | null | undefined): Price | null {
  if (!model) return SONNET; // unknown → sonnet-tier fallback
  const m = model.toLowerCase();
  if (m.includes("fable") || m.includes("mythos")) return null; // synthetic test models — not billable
  // Exact id first (dated snapshots included); "claude-opus-5[1m]" → "claude-opus-5".
  const live = fetched.get(m) ?? fetched.get(m.replace(/\[.*$/, ""));
  if (live) return live;
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

/** Cache-write TTL the user's tool writes: prices differ (5m = 1.25× input,
 *  1h = 2× input). Claude Code writes 1h caches, so that's the default. */
export type CacheTtl = "5m" | "1h";

/** USD cost of a set of token counts under one model's list price. */
export function costForTokens(
  t: TokenCounts,
  model: string | null,
  ttl: CacheTtl = "1h",
): number {
  const p = priceFor(model);
  const cacheWrite = ttl === "5m" ? p.input * 1.25 : p.cacheWrite;
  return (
    (t.inputTokens * p.input +
      t.outputTokens * p.output +
      t.cacheCreationTokens * cacheWrite +
      t.cacheReadTokens * p.cacheRead) /
    1_000_000
  );
}

/** Cost of one record in USD. */
export function costUsd(e: UsageRecord, ttl: CacheTtl = "1h"): number {
  return costForTokens(e, e.model, ttl);
}

/** Cost of pre-summed totals, assuming a single representative model. */
export function costForTotals(
  totals: TokenTotals,
  model: string | null,
  ttl: CacheTtl = "1h",
): number {
  return costForTokens(totals, model, ttl);
}
