export type OsName = 'mac' | 'linux' | 'windows' | string

/** Which app produced a record. `cli` = Claude Code (`~/.claude/projects`);
 *  `desktop` = Claude Desktop agent-mode/Cowork sessions (same JSONL format under
 *  the app's `local-agent-mode-sessions/<session>/.claude/projects`);
 *  `pi` = the pi coding agent (`~/.pi/agent/sessions`, its own JSONL format —
 *  only records with provider "anthropic" count against Claude limits). */
export type UsageSource = 'cli' | 'desktop' | 'pi'

/** Wire record sent to POST /api/v1/usage. Field names match the server's
 *  `RecordSchema` (apps/web/src/routes/api/v1/usage.ts); a mismatch is a 400,
 *  which the uploader treats as permanently invalid and skips. */
export interface UsageRecord {
	uuid: string
	messageId: string | null
	requestId: string | null
	model: string | null
	sessionId: string | null
	timestamp: string
	cwd: string | null
	gitBranch: string | null
	version: string | null
	inputTokens: number
	outputTokens: number
	cacheCreationTokens: number
	cacheReadTokens: number
	serviceTier: string | null
	source: UsageSource
}

export interface BatchPayload {
	os: OsName
	hostname: string
	collectorVersion: string
	sentAt: string
	records: UsageRecord[]
}

/** Per-log tail position. Only these two fields decide anything: the inode
 *  detects rotation, the offset resumes the read. Older state files carry extra
 *  keys (dev/size/mtimeMs) that were never read; they are simply ignored. */
export interface FileState {
	inode: number
	offset: number
}

/** Tail progress: which logs we have read and how far. */
export interface StateFile {
	deviceId: string
	files: Record<string, FileState>
	updatedAt: string
}

/** High-water mark for one limit window, so a threshold alerts once per window. */
export interface WindowNotifyState {
	lastBucket: number
	resetsAt: string | null
}

export interface NotifyState {
	fiveHour: WindowNotifyState
	sevenDay: WindowNotifyState
}

/** Last limits reading, so `status` can show current usage offline instead of
 *  spending another billable API call. Written by `reportLimitsOnce`. */
export interface LimitsMark {
	at: string
	source: string
	fiveHourPct: number | null
	sevenDayPct: number | null
}

/**
 * Everything the CLI persists, in one file (see store.ts). Settings the user
 * sets live at the top level; the two machine-managed sections are nested so a
 * writer can replace its own section without touching anyone else's.
 */
export interface Store {
	version: 1
	token?: string
	projectsDir?: string
	desktopDir?: string
	/** One path, or several (pi's session root moves with PI_CODING_AGENT_DIR). */
	piDir?: string | string[]
	limits?: LimitsMark
	state: StateFile
	notify: NotifyState
}

export interface Config {
	token: string
	/** The single JSON file backing every persisted value (see store.ts). */
	storePath: string
	projectsDir: string
	/** Claude Desktop agent-mode sessions root to also scan, or null to disable. */
	desktopDir: string | null
	/** pi agent sessions roots to also scan (empty to disable). */
	piDirs: string[]
	batchSize: number
}
