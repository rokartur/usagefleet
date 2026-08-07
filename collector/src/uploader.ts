import type { LimitsReport } from "./claude-limits.js";
import type { BatchPayload, Config } from "./types.js";

const MAX_ATTEMPTS = 6;
const REQUEST_TIMEOUT_MS = 15000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Why an upload failed, so the caller can decide whether to advance the offset.
 *  - "auth":      401/403 — token revoked/expired. Keep offset; data is valid and
 *                 must upload once a fresh token is configured. Surface loudly.
 *  - "invalid":   other non-429 4xx (400/422) — server rejected the records as
 *                 malformed. Advance past them so they can't wedge the pipeline.
 *  - "transient": 5xx / network / timeout, retries exhausted. Keep offset and
 *                 retry next cycle; do not starve later files. */
export type UploadFailure = "auth" | "invalid" | "transient";

export type UploadResult =
  | { ok: true; accepted?: number; duplicates?: number }
  | { ok: false; fatal: UploadFailure };

/**
 * POST a batch with exponential backoff + jitter. Returns ok on 2xx, otherwise a
 * classified failure so the caller advances or retains the file offset correctly.
 */
export async function uploadBatch(payload: BatchPayload, cfg: Config): Promise<UploadResult> {
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
    // Non-retryable 4xx (except 429): classify so the caller handles it without
    // re-POSTing the same chunk forever.
    if (res && res.status >= 400 && res.status < 500 && res.status !== 429) {
      const fatal: UploadFailure = res.status === 401 || res.status === 403 ? "auth" : "invalid";
      return { ok: false, fatal };
    }

    const fallback = Math.min(delay, 60000) + Math.floor(Math.random() * 500);
    if (attempt < MAX_ATTEMPTS) {
      await sleep(retryAfterMs(res?.headers.get("retry-after"), fallback));
    }
    delay *= 2;
  }
  return { ok: false, fatal: "transient" };
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
export async function postLimits(report: LimitsReport, cfg: Config): Promise<boolean> {
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
