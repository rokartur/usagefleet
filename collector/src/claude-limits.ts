import type { ClaudeCreds } from "./claude-creds.js";

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";

export interface LimitsReport {
  source: "sub" | "api";
  fiveHourPct: number | null;
  sevenDayPct: number | null;
  fiveHourResetsAt: string | null;
  sevenDayResetsAt: string | null;
}

export function parsePct(v: string | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // Header is a percent (e.g. "37"); guard the 0–1 fraction form too.
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.min(100, Math.max(0, Math.round(pct)));
}

export function parseReset(v: string | null): string | null {
  if (!v) return null;
  const num = Number(v);
  if (Number.isFinite(num) && num > 1_000_000_000) {
    // unix seconds (or ms)
    const ms = num > 1e12 ? num : num * 1000;
    return new Date(ms).toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseLimitsHeaders(
  source: "sub" | "api",
  get: (name: string) => string | null,
): LimitsReport {
  return {
    source,
    fiveHourPct: parsePct(get("anthropic-ratelimit-unified-5h-utilization")),
    sevenDayPct: parsePct(get("anthropic-ratelimit-unified-7d-utilization")),
    fiveHourResetsAt: parseReset(get("anthropic-ratelimit-unified-5h-reset")),
    sevenDayResetsAt: parseReset(get("anthropic-ratelimit-unified-7d-reset")),
  };
}

/**
 * Read the account's real rate-limit utilization. Sends a 1-token ping to the
 * Messages API; Anthropic returns the unified 5h/7d utilization in response
 * headers (same approach as Claude-Usage-Tracker's OAuth path).
 */
export async function fetchLimits(creds: ClaudeCreds): Promise<LimitsReport> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": "2023-06-01",
  };
  if (creds.source === "sub") {
    headers["authorization"] = `Bearer ${creds.token}`;
    headers["anthropic-beta"] = "oauth-2025-04-20";
    headers["user-agent"] = "claude-code/2.1.5 (claude-track)";
  } else {
    headers["x-api-key"] = creds.token;
  }

  const res = await fetch(MESSAGES_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
    signal: AbortSignal.timeout(15000),
  });
  // The unified rate-limit headers are present on success AND error responses.
  return parseLimitsHeaders(creds.source, (n) => res.headers.get(n));
}
