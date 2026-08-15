import type { LimitsReport } from './claude-limits.js'
import type { BatchPayload, Config } from './types.js'

const MAX_ATTEMPTS = 6
const REQUEST_TIMEOUT_MS = 15_000

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => {
		setTimeout(resolve, ms)
	})
}

/** Why an upload failed, so the caller can decide whether to advance the offset.
 *  - "auth":      401/403 — token revoked/expired. Keep offset; data is valid and
 *                 must upload once a fresh token is configured. Surface loudly.
 *  - "invalid":   400/422 only — the server parsed the request and rejected the
 *                 records themselves as malformed. The ONLY case where advancing
 *                 past data is correct, because a re-POST would fail identically.
 *  - "plan":      402 — the device sits outside the account's device limit. Keep
 *                 offset; every other file answers the same, so the caller stops
 *                 the cycle instead of asking once per file.
 *  - "transient": everything else (404 wrong endpoint, 413 too large, 429, 5xx,
 *                 network, timeout). Keep offset and retry next cycle; do not
 *                 starve later files.
 *
 *  Classification is a whitelist on purpose: a status we did not anticipate must
 *  never destroy data. Getting this backwards silently shredded the usage history
 *  of every device parked outside its plan (the server answers those with 402). */
export type UploadFailure = 'auth' | 'invalid' | 'plan' | 'transient'

export type UploadResult = { ok: true; accepted?: number; duplicates?: number } | { ok: false; fatal: UploadFailure }

/**
 * POST a batch with exponential backoff + jitter. Returns ok on 2xx, otherwise a
 * classified failure so the caller advances or retains the file offset correctly.
 */
export async function uploadBatch(payload: BatchPayload, cfg: Config): Promise<UploadResult> {
	let delay = 1000
	for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
		let res: Response | null = null
		try {
			res = await fetch(`${cfg.endpoint}/api/v1/usage`, {
				body: JSON.stringify(payload),
				headers: {
					'content-type': 'application/json',
					'x-api-key': cfg.token,
				},
				method: 'POST',
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			})
		} catch {
			res = null // network error / timeout → retry
		}

		if (res && res.ok) {
			const body = (await res.json().catch(() => ({}))) as {
				accepted?: number
				duplicates?: number
			}
			return { ok: true, ...body }
		}
		// Non-retryable 4xx (except 429): no amount of retrying inside this cycle
		// changes the answer, so classify and hand it back to the caller now.
		if (res && res.status >= 400 && res.status < 500 && res.status !== 429) {
			return { fatal: classifyClientError(res.status), ok: false }
		}

		const fallback = Math.min(delay, 60_000) + Math.floor(Math.random() * 500)
		if (attempt < MAX_ATTEMPTS) {
			await sleep(retryAfterMs(res?.headers.get('retry-after'), fallback))
		}
		delay *= 2
	}
	return { fatal: 'transient', ok: false }
}

/** Map a 4xx (never 429, the caller filters it) to a failure kind. */
function classifyClientError(status: number): UploadFailure {
	if (status === 401 || status === 403) {
		return 'auth'
	}
	if (status === 400 || status === 422) {
		return 'invalid'
	}
	if (status === 402) {
		return 'plan'
	}
	return 'transient' // 404, 408, 413, … — the data is fine
}

/** Parse a Retry-After header (delta-seconds OR HTTP-date), clamped to [0, 60s]. */
function retryAfterMs(header: string | null | undefined, fallback: number): number {
	if (!header) {
		return fallback
	}
	let wait: number
	const secs = Number(header)
	if (Number.isFinite(secs)) {
		wait = secs * 1000
	} else {
		const when = Date.parse(header)
		if (!Number.isFinite(when)) {
			return fallback
		}
		wait = when - Date.now()
	}
	return Math.min(Math.max(wait, 0), 60_000) + Math.floor(Math.random() * 500)
}

/** Report the account's real limit utilization to the server. */
export async function postLimits(report: LimitsReport, cfg: Config): Promise<boolean> {
	try {
		const res = await fetch(`${cfg.endpoint}/api/v1/limits`, {
			body: JSON.stringify(report),
			headers: {
				'content-type': 'application/json',
				'x-api-key': cfg.token,
			},
			method: 'POST',
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
		return res.ok
	} catch {
		return false
	}
}
