import type { LimitsReport } from "./claude-limits.js";
import type { BatchPayload, Config } from "./types.js";

const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST a batch with exponential backoff + jitter. Returns true on 2xx.
 * Non-retryable 4xx (except 429) returns false immediately.
 */
export async function uploadBatch(
  payload: BatchPayload,
  cfg: Config,
): Promise<{ ok: boolean; accepted?: number; duplicates?: number }> {
  let delay = 1000;
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(`${cfg.endpoint}/api/v1/usage`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": cfg.token,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      res = null; // network error / timeout → retry
    }

    if (res && res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        accepted?: number;
        duplicates?: number;
      };
      return { ok: true, ...body };
    }
    if (res && res.status >= 400 && res.status < 500 && res.status !== 429) {
      return { ok: false };
    }

    const fallback = Math.min(delay, 60000) + Math.floor(Math.random() * 500);
    if (attempt < MAX_ATTEMPTS) {
      await sleep(retryAfterMs(res?.headers.get("retry-after"), fallback));
    }
    delay *= 2;
  }
  return { ok: false };
}

/** Parse a Retry-After header (delta-seconds OR HTTP-date), clamped to [0, 60s]. */
function retryAfterMs(header: string | null | undefined, fallback: number): number {
  if (!header) return fallback;
  let wait: number;
  const secs = Number(header);
  if (Number.isFinite(secs)) {
    wait = secs * 1000;
  } else {
    const when = Date.parse(header);
    if (!Number.isFinite(when)) return fallback;
    wait = when - Date.now();
  }
  return Math.min(Math.max(wait, 0), 60000) + Math.floor(Math.random() * 500);
}

/** Report the account's real limit utilization to the server. */
export async function postLimits(
  report: LimitsReport,
  cfg: Config,
): Promise<boolean> {
  try {
    const res = await fetch(`${cfg.endpoint}/api/v1/limits`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.token,
      },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return res.ok;
  } catch {
    return false;
  }
}
