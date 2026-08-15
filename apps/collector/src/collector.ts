import { existsSync } from 'node:fs'
import { hostname } from 'node:os'
import { sep } from 'node:path'
import { detectClaudeCreds, macKeychainDenied } from './claude-creds.js'
import { fetchLimits } from './claude-limits.js'
import type { LimitsReport } from './claude-limits.js'
import { maybeNotify } from './notifier.js'
import { detectOs } from './os.js'
import { RELEASE_VERSION } from './release.js'
import { listJsonlFiles } from './scanner.js'
import { readStore, updateStore } from './store.js'
import { tailFile } from './tailer.js'
import type { Config, UsageRecord, UsageSource } from './types.js'
import { postLimits, uploadBatch } from './uploader.js'
import type { UploadFailure } from './uploader.js'

/** Only files inside a `.../.claude/projects/...` subtree are real usage logs.
 *  Desktop session roots also hold `audit.jsonl` (a full duplicate of the same
 *  uuids) and other JSONL — restricting to this subtree mirrors Claude Code and
 *  avoids re-uploading every desktop record twice. */
const PROJECTS_SUBPATH = `${sep}.claude${sep}projects${sep}`

export interface CycleResult {
	files: number
	sent: number
	accepted: number
	duplicates: number
	failed: boolean
	/** Records the server rejected as malformed and we gave up on. Real data loss,
	 *  so it is counted and logged rather than folded into `failed`. */
	dropped: number
}

/**
 * One full scan: tail every JSONL file from its stored offset, upload new usage
 * records (chunked to batchSize), and commit each file's offset only after all
 * its chunks are acknowledged (at-least-once; the server dedups on uuid).
 */
export async function runOnce(
	cfg: Config,
	log: (msg: string) => void = () => {
		/* empty */
	},
): Promise<CycleResult> {
	const { state } = readStore(cfg.storePath)

	// Each scan root is tagged with the app that owns it. Claude Code's projects
	// dir is scanned whole; the Claude Desktop sessions root is filtered to its
	// `.claude/projects` subtree (see PROJECTS_SUBPATH).
	const roots: { dir: string; source: UsageSource; onlyProjects: boolean }[] = [
		{ dir: cfg.projectsDir, onlyProjects: false, source: 'cli' },
	]
	if (cfg.desktopDir) {
		roots.push({ dir: cfg.desktopDir, onlyProjects: true, source: 'desktop' })
	}
	for (const dir of cfg.piDirs) {
		roots.push({ dir, onlyProjects: false, source: 'pi' })
	}
	const files: { fp: string; source: UsageSource }[] = []
	for (const root of roots) {
		for (const fp of listJsonlFiles(root.dir)) {
			if (root.onlyProjects && !fp.includes(PROJECTS_SUBPATH)) {
				continue
			}
			files.push({ fp, source: root.source })
		}
	}

	const result: CycleResult = {
		accepted: 0,
		dropped: 0,
		duplicates: 0,
		failed: false,
		files: files.length,
		sent: 0,
	}

	// Defensive: a bad batchSize must never stall the chunk loop.
	const step = cfg.batchSize > 0 ? Math.floor(cfg.batchSize) : 100
	let advanced = false

	for (const { fp, source } of files) {
		let tail
		try {
			tail = tailFile(fp, state.files[fp], source)
		} catch (error) {
			// One unreadable/oversized file must not abort the whole cycle.
			log(`skip ${fp}: ${(error as Error).message}`)
			continue
		}
		if (!tail || tail.consumedBytes === 0) {
			continue
		}

		if (tail.records.length === 0) {
			// Consumed only non-usage lines — safe to advance immediately.
			state.files[fp] = tail.nextState
			advanced = true
			continue
		}

		// sendChunk absorbs "invalid" by bisecting, so only auth/transient escape.
		let outcome: 'ok' | UploadFailure = 'ok'
		for (let i = 0; i < tail.records.length; i += step) {
			outcome = await sendChunk(tail.records.slice(i, i + step), cfg, result, log)
			if (outcome !== 'ok') {
				break
			}
		}

		if (outcome === 'ok') {
			state.files[fp] = tail.nextState
			advanced = true
		} else if (outcome === 'auth') {
			// Token revoked/expired. The data is valid and must NOT be skipped — keep
			// the offset so it uploads once a fresh token is configured. Retrying the
			// remaining files would 401 identically, so stop this cycle and surface.
			log(
				`auth rejected (401/403) — device token invalid or revoked; re-run \`usagefleet init\` with a fresh token, then restart the service`,
			)
			result.failed = true
			break
		} else if (outcome === 'invalid') {
			// The whole batch was rejected, not individual records (see sendChunk).
			// Keep the offset: this needs a collector or server fix, not a purge.
			log(
				`upload for ${fp} rejected as a whole batch — keeping the offset; check that this collector version and OS are supported by the server`,
			)
			result.failed = true
		} else {
			// transient (402 outside plan, 5xx, network, timeout): keep the offset and
			// retry next cycle, but DO NOT break — later files must still get a turn.
			log(`upload failed for ${fp} (transient) — will retry next cycle`)
			result.failed = true
		}
	}

	// One durable write per cycle rather than one per file: the store is fsynced
	// on every save, and a crash mid-cycle only costs a re-upload the server
	// dedups. Only our own section is replaced, so a token written by a
	// concurrent `usagefleet init` survives.
	if (pruneMissingFiles(state, files) || advanced) {
		updateStore(cfg.storePath, store => {
			store.state.files = state.files
			store.state.updatedAt = new Date().toISOString()
		})
	}

	return result
}

/**
 * Upload one chunk and tally it. A 400/422 means the server parsed the request
 * and rejected the records themselves, so the chunk is split and the halves are
 * retried: one malformed line then costs one record instead of the whole batch.
 * Bisection adds ~log2(n) requests and only on the rare malformed line.
 * Every other failure is handed back untouched so the caller keeps the offset.
 *
 * A 400 can also mean the server rejected the *envelope* — an `os` or
 * `collectorVersion` outside its schema — in which case every record fails and
 * bisecting would drop the entire batch for a bug that an upgrade fixes. So the
 * split stops after MAX_DROPPED_PER_CHUNK drops and the rest is handed back as
 * `invalid`, which keeps the offset. Real malformed lines are rare and isolated;
 * anything that survives that many splits is not record-shaped.
 */
const MAX_DROPPED_PER_CHUNK = 2

async function sendChunk(
	records: UsageRecord[],
	cfg: Config,
	result: CycleResult,
	log: (msg: string) => void,
	dropCeiling = result.dropped + MAX_DROPPED_PER_CHUNK,
): Promise<'ok' | UploadFailure> {
	const res = await uploadBatch(
		{
			collectorVersion: RELEASE_VERSION,
			hostname: hostname(),
			os: detectOs(),
			records,
			sentAt: new Date().toISOString(),
		},
		cfg,
	)
	if (res.ok) {
		result.sent += records.length
		result.accepted += res.accepted ?? 0
		result.duplicates += res.duplicates ?? 0
		return 'ok'
	}
	if (res.fatal !== 'invalid') {
		return res.fatal
	}

	const single = records[0]
	if (records.length === 1 && single) {
		if (result.dropped >= dropCeiling) {
			// Give up on the record theory. The caller keeps the offset, so the
			// records counted on the way down are retried, not lost — untally them
			// rather than report a loss that did not happen.
			log(`every split of this batch was rejected, so the batch itself is bad, not its records — nothing skipped`)
			result.dropped = dropCeiling - MAX_DROPPED_PER_CHUNK
			return 'invalid'
		}
		log(`server rejected record ${single.uuid} as malformed — skipping it`)
		result.dropped += 1
		result.failed = true
		return 'ok'
	}

	const mid = Math.ceil(records.length / 2)
	const head = await sendChunk(records.slice(0, mid), cfg, result, log, dropCeiling)
	return head === 'ok' ? sendChunk(records.slice(mid), cfg, result, log, dropCeiling) : head
}

/**
 * Drop offsets for logs that no longer exist on disk, so a long-lived install
 * does not grow its state file by one entry per Claude session forever. Only
 * paths absent from this cycle's scan are stat'd, and only a real ENOENT prunes
 * — a root that is merely unconfigured right now keeps its offsets.
 * Returns whether anything was removed.
 */
function pruneMissingFiles(state: { files: Record<string, unknown> }, scanned: { fp: string }[]): boolean {
	const seen = new Set(scanned.map(f => f.fp))
	let removed = false
	for (const fp of Object.keys(state.files)) {
		if (seen.has(fp) || existsSync(fp)) {
			continue
		}
		// oxlint-disable-next-line typescript/no-dynamic-delete -- state.files is a JSON blob keyed by path
		delete state.files[fp]
		removed = true
	}
	return removed
}

/**
 * Auto-detect the local Claude login, read the real 5h/weekly utilization from
 * Anthropic's rate-limit headers, and report it to the server. Best-effort —
 * returns null (and logs) when no login is found or the request fails.
 */
export async function reportLimitsOnce(
	cfg: Config,
	log: (msg: string) => void = () => {
		/* empty */
	},
): Promise<LimitsReport | null> {
	const creds = await detectClaudeCreds()
	if (!creds) {
		if (process.platform === 'darwin' && macKeychainDenied()) {
			// "Works by hand, broken as a service" signature: a launchd agent can be
			// denied the login-Keychain read. Make it diagnosable instead of silent.
			log(
				"limits skipped: login Keychain read for 'Claude Code-credentials' was denied " +
					'(typical under a background launchd agent). Grant /usr/bin/security access to the ' +
					'item, or set ANTHROPIC_API_KEY for the service.',
			)
		} else {
			log(
				'no usable Claude login — missing, or expired with a refresh that failed; ' +
					'sign in with `claude` or set ANTHROPIC_API_KEY',
			)
		}
		return null
	}
	let report: LimitsReport
	try {
		report = await fetchLimits(creds)
	} catch (error) {
		log(`limits fetch failed: ${(error as Error).message}`)
		return null
	}
	const ok = await postLimits(report, cfg)
	if (!ok) {
		log('limits upload failed')
	}
	// Cache the reading so `status` can show current usage without spending
	// another billable API call.
	updateStore(cfg.storePath, store => {
		store.limits = {
			at: new Date().toISOString(),
			fiveHourPct: report.fiveHourPct,
			sevenDayPct: report.sevenDayPct,
			source: report.source,
		}
	})
	// Local desktop notification on freshly-crossed thresholds. Independent of the
	// server upload (notify even if the POST failed) and never throws.
	maybeNotify(report, undefined, log)
	return report
}
