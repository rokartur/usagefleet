import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { str } from './parser.js'
import type { JcodeSessionState, UsageRecord } from './types.js'

// "claude" and "claude-oauth" run on the Claude subscription; "claude-api" is a billed API key.
const SUBSCRIPTION_PROVIDERS = new Set(['claude', 'claude-oauth'])

// Same reason as the scanner's QUIET_MS: a write right after a read can keep the read's mtime.
const QUIET_MS = 10_000

interface JcodeMessage {
	id?: unknown
	role?: unknown
	timestamp?: unknown
	token_usage?: {
		input_tokens?: number
		output_tokens?: number
		cache_read_input_tokens?: number
		cache_creation_input_tokens?: number
	}
}

interface JcodeMeta {
	model?: unknown
	provider_key?: unknown
	working_dir?: unknown
}

interface JournalLine {
	meta?: JcodeMeta
	append_messages?: JcodeMessage[]
}

export function listJcodeSessions(dir: string): string[] {
	if (!existsSync(dir)) {
		return []
	}
	return readdirSync(dir)
		.filter(name => name.startsWith('session_') && name.endsWith('.json'))
		.map(name => join(dir, name))
}

/**
 * New subscription turns of one jcode session, or null when its files have not
 * changed since `prev`. jcode keeps a session as `<id>.json`, rewritten whole, plus
 * `<id>.journal.jsonl`, appended per turn and folded into the snapshot at checkpoints
 * (an interrupted one leaves a turn in both). So both are read and turns key on their
 * id, and anything at or before `prev.uploadedThrough` was already sent.
 */
export function readJcodeSession(
	snapshotPath: string,
	prev?: JcodeSessionState,
): { records: UsageRecord[]; nextState: JcodeSessionState } | null {
	const journalPath = snapshotPath.replace(/\.json$/, '.journal.jsonl')
	const mtimeMs = Math.max(
		statSync(snapshotPath).mtimeMs,
		existsSync(journalPath) ? statSync(journalPath).mtimeMs : 0,
	)
	if (prev?.mtimeMs === mtimeMs) {
		return null
	}

	const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8')) as JcodeMeta & {
		id?: unknown
		messages?: JcodeMessage[]
	}
	// shortcut: snapshot turns take the session's current provider/model; a provider switch rewrites
	// the snapshot, so a first backfill of such a session books older turns on the new provider.
	const turns: [JcodeMessage, JcodeMeta][] = (snapshot.messages ?? []).map(m => [m, snapshot])
	for (const line of readJournal(journalPath)) {
		for (const m of line.append_messages ?? []) {
			turns.push([m, line.meta ?? snapshot])
		}
	}

	const uploadedThrough = prev?.uploadedThrough ?? 0
	let newest = uploadedThrough
	const seen = new Set<string>()
	const records: UsageRecord[] = []
	for (const [message, meta] of turns) {
		const record = toRecord(message, meta, str(snapshot.id))
		if (!record || seen.has(record.uuid) || Date.parse(record.timestamp) <= uploadedThrough) {
			continue
		}
		seen.add(record.uuid)
		records.push(record)
		newest = Math.max(newest, Date.parse(record.timestamp))
	}
	return {
		nextState: { mtimeMs: Date.now() - mtimeMs > QUIET_MS ? mtimeMs : 0, uploadedThrough: newest },
		records,
	}
}

function readJournal(path: string): JournalLine[] {
	if (!existsSync(path)) {
		return []
	}
	const lines: JournalLine[] = []
	for (const text of readFileSync(path, 'utf-8').split('\n')) {
		try {
			lines.push(JSON.parse(text) as JournalLine)
		} catch {
			// The empty tail after the last newline, or the line jcode is still writing.
		}
	}
	return lines
}

/** jcode's `token_usage` is Anthropic's usage block (`prompt_tokens` is their sum, left out). */
function toRecord(m: JcodeMessage, meta: JcodeMeta, sessionId: string | null): UsageRecord | null {
	const u = m.token_usage
	const id = str(m.id)
	const timestamp = str(m.timestamp)
	if (
		m.role !== 'assistant' ||
		!u ||
		!id ||
		!timestamp ||
		Number.isNaN(Date.parse(timestamp)) ||
		!SUBSCRIPTION_PROVIDERS.has(str(meta.provider_key) ?? '')
	) {
		return null
	}
	return {
		// jcode does not log the cache-write TTL; the server prices it by the user's setting.
		cacheCreation1h: null,
		cacheCreation5m: null,
		cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
		cacheReadTokens: u.cache_read_input_tokens ?? 0,
		cwd: str(meta.working_dir),
		gitBranch: null,
		inputTokens: u.input_tokens ?? 0,
		messageId: id,
		model: str(meta.model),
		outputTokens: u.output_tokens ?? 0,
		requestId: null,
		serviceTier: null,
		sessionId,
		source: 'jcode',
		timestamp,
		uuid: `jcode:${id}`,
		version: null,
	}
}
