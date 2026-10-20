/** Closed on purpose: the server's `BatchSchema` accepts exactly these, so a
 *  `| string` escape hatch here would let an unsupported platform send an `os`
 *  that 400s every batch forever. Anything else reports as `other`. */
export type OsName = 'mac' | 'linux' | 'windows' | 'other'

/** Which app produced a record. `cli` = Claude Code (`~/.claude/projects`);
 *  `desktop` = Claude Desktop agent-mode/Cowork sessions (same JSONL format under
 *  the app's `local-agent-mode-sessions/<session>/.claude/projects`);
 *  `pi` = the pi coding agent (`~/.pi/agent/sessions`, its own JSONL format —
 *  only providers "anthropic" and "claude-bridge" count against Claude limits);
 *  `jcode` = the jcode agent (`~/.jcode/sessions`, JSON snapshot + journal);
 *  `pj` = the pj fork of jcode (`~/.pj/sessions`, same format);
 *  `agent` = the agent CLI (`~/.agents/sessions`, one `usage` line per request
 *  naming the provider and Claude account that served it). */
export type UsageSource = 'cli' | 'desktop' | 'pi' | 'jcode' | 'pj' | 'agent'

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
	/** Per-TTL split of cacheCreationTokens (5m vs 1h writes price differently).
	 *  Null when the log line predates the `cache_creation` breakdown. */
	cacheCreation5m: number | null
	cacheCreation1h: number | null
	cacheReadTokens: number
	serviceTier: string | null
	source: UsageSource
}

export interface BatchPayload {
	os: OsName
	hostname: string
	collectorVersion: string
	sentAt: string
	/** accountUuid from ~/.claude.json at send time, so the server books the batch
	 *  on the Claude account that metered it even across a /login switch. */
	accountExtId?: string
	records: UsageRecord[]
}

/** Per-log tail position. The inode detects rotation, the offset resumes the read,
 *  and for a pi session the account it was pinned to at that offset carries over,
 *  since the line naming it lies behind the offset. Older state files carry extra
 *  keys (dev/size/mtimeMs) that were never read; they are simply ignored. */
export interface FileState {
	inode: number
	offset: number
	accountExtId?: string
}

/** jcode progress per session snapshot path. The session's newest file mtime when
 *  last read lets an untouched session skip parsing; `uploadedThrough` (epoch ms of
 *  the newest uploaded turn) stands in for an offset, since the snapshot is rewritten whole. */
export interface JcodeSessionState {
	mtimeMs: number
	uploadedThrough: number
}

/** Tail progress: which logs we have read and how far. */
export interface StateFile {
	deviceId: string
	files: Record<string, FileState>
	jcode: Record<string, JcodeSessionState>
	updatedAt: string
}

/** How loud the desktop alerts are. `off` is silent; the rest pick the utilization
 *  thresholds that fire (see NOTIFY_MODES in notifier.ts). */
export type NotifyMode = 'off' | 'quiet' | 'standard' | 'steady' | 'critical'

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
	/** Claude accountUuid → the device token `login` bound to it, for a machine that
	 *  switches between accounts reporting to different fleets. */
	accountTokens?: Record<string, string>
	projectsDir?: string
	desktopDir?: string
	jcodeDir?: string
	pjDir?: string
	agentDir?: string
	/** One path, or several (pi's session root moves with PI_CODING_AGENT_DIR). */
	piDir?: string | string[]
	// Every USAGEFLEET_* knob is also a file key (the matching env var wins);
	// resolution lives in config.ts (positiveNumber/flagOff) and each read site.
	/** Watch poll seconds (USAGEFLEET_INTERVAL). */
	interval?: number
	/** Seconds between limits reports (USAGEFLEET_LIMITS_INTERVAL). */
	limitsInterval?: number
	/** Records per upload (USAGEFLEET_BATCH). */
	batch?: number
	/** false disables desktop notifications (USAGEFLEET_NOTIFY). Named apart
	 *  from the machine-managed `notify` section below. */
	notifications?: boolean
	/** Alert preset for this machine (USAGEFLEET_NOTIFY_MODE). Beats the mode set on
	 *  the Devices page; an explicit `notifyThresholds` list beats both. */
	notifyMode?: NotifyMode
	/** Utilization % alert thresholds (USAGEFLEET_NOTIFY_THRESHOLDS). */
	notifyThresholds?: number[]
	/** false keeps the prompt guard out of Claude Code and pi (USAGEFLEET_HOOK). */
	hook?: boolean
	/** false disables self-update while watching (USAGEFLEET_UPDATE). */
	update?: boolean
	/** Seconds between update checks (USAGEFLEET_UPDATE_INTERVAL). */
	updateInterval?: number
	limits?: LimitsMark
	state: StateFile
	notify: NotifyState
}

export interface Config {
	/** Used for any Claude account without a token of its own in `accountTokens`. */
	token: string
	accountTokens: Record<string, string>
	/** The single JSON file backing every persisted value (see store.ts). */
	storePath: string
	projectsDir: string
	/** Claude Desktop agent-mode sessions root to also scan, or null to disable. */
	desktopDir: string | null
	/** pi agent sessions roots to also scan (empty to disable). */
	piDirs: string[]
	/** jcode's flat sessions dir (`session_*.json` + `.journal.jsonl`), or null to disable. */
	jcodeDir: string | null
	/** pj's sessions dir, jcode's format under `~/.pj`, or null to disable. */
	pjDir: string | null
	/** The agent CLI's flat sessions dir (`<id>.jsonl`), or null to disable. */
	agentDir: string | null
	batchSize: number
}
