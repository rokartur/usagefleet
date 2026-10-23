import type { UsageRecord, UsageSource } from './types.js'

interface RawUsage {
	input_tokens?: number
	output_tokens?: number
	cache_creation_input_tokens?: number
	cache_read_input_tokens?: number
	cache_creation?: {
		ephemeral_5m_input_tokens?: number
		ephemeral_1h_input_tokens?: number
	}
	service_tier?: string
}

/** Only accept genuine strings; ignores numbers/objects that would later break. */
export function str(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null
}

/** A valid ISO-ish timestamp string, else the current time (never an invalid one). */
function validTimestamp(v: unknown): string {
	if (typeof v === 'string' && !Number.isNaN(new Date(v).getTime())) {
		return v
	}
	return new Date().toISOString()
}

/** Cache-write tokens, with the per-TTL breakdown when the log carries it.
 *  5m and 1h writes are priced differently (1.25× vs 2× input), so the server
 *  wants the split — null means "the log predates the breakdown", not zero. */
function cacheCreation(u: RawUsage): { total: number; five: number | null; oneHour: number | null } {
	const c = u.cache_creation
	const five = typeof c?.ephemeral_5m_input_tokens === 'number' ? c.ephemeral_5m_input_tokens : null
	const oneHour = typeof c?.ephemeral_1h_input_tokens === 'number' ? c.ephemeral_1h_input_tokens : null
	const total =
		typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : (five ?? 0) + (oneHour ?? 0)
	return { five, oneHour, total }
}

/** The 5m/1h split of a cache write for logs that name only its 1h part; unknown when they do not. */
export function cacheSplit(total: number, oneHour: unknown): Pick<UsageRecord, 'cacheCreation1h' | 'cacheCreation5m'> {
	if (typeof oneHour !== 'number') {
		return { cacheCreation1h: null, cacheCreation5m: null }
	}
	const capped = Math.min(Math.max(oneHour, 0), total)
	return { cacheCreation1h: capped, cacheCreation5m: total - capped }
}

/** pi agent session line: `{type:"message", id, timestamp, message:{role:"assistant",
 *  provider, model, responseId, usage:{input, output, cacheRead, cacheWrite, cacheWrite1h?}}}`.
 *  Only requests that land on the user's Claude subscription count: provider
 *  "anthropic" (pi's own client) and "claude-bridge" (the extension that routes
 *  through Claude Code's OAuth login, so it burns the same limits — and writes no
 *  responseId, so those lines key by id+timestamp). Other providers
 *  (openai-codex, openrouter, …) are skipped. `output` already includes reasoning
 *  tokens (totalTokens = input + output + cacheRead + cacheWrite).
 *  The line carries no working directory; `sessionCwd` comes from the file's
 *  session header (see piSessionCwd). */
function parsePiLine(o: Record<string, unknown>, sessionCwd: string | null): UsageRecord | null {
	if (o.type !== 'message') {
		return null
	}
	const m = o.message as
		| {
				role?: string
				provider?: string
				model?: string
				responseId?: string
				usage?: {
					input?: number
					output?: number
					cacheRead?: number
					cacheWrite?: number
					cacheWrite1h?: number
				}
		  }
		| undefined
	if (!m || m.role !== 'assistant' || (m.provider !== 'anthropic' && m.provider !== 'claude-bridge')) {
		return null
	}
	const u = m.usage
	if (typeof u !== 'object' || u === null) {
		return null
	}
	// Idempotency key: the Anthropic response id is globally unique; the line's own
	// short id needs the timestamp to be collision-safe across sessions.
	const rid = str(m.responseId)
	const lid = str(o.id)
	const uuid = rid ? `pi:${rid}` : lid ? `pi:${lid}:${validTimestamp(o.timestamp)}` : null
	if (!uuid) {
		return null
	}
	return {
		// Older pi lines lack cacheWrite1h; the server prices those by the user's TTL setting.
		...cacheSplit(u.cacheWrite ?? 0, u.cacheWrite1h),
		cacheCreationTokens: u.cacheWrite ?? 0,
		cacheReadTokens: u.cacheRead ?? 0,
		cwd: sessionCwd,
		gitBranch: null,
		inputTokens: u.input ?? 0,
		messageId: rid,
		model: str(m.model),
		outputTokens: u.output ?? 0,
		requestId: null,
		serviceTier: null,
		sessionId: null,
		source: 'pi',
		timestamp: validTimestamp(o.timestamp),
		uuid,
		version: null,
	}
}

/** agent CLI session line: `{type:"usage", id, provider, account, model, timestamp,
 *  input, output, cache_read, cache_write, cache_write_1h?}`, one per request, `timestamp` in epoch ms.
 *  Only provider "anthropic" with an `account` (the Claude account uuid; API keys
 *  have none) ran on a subscription, and each line books on its own account because
 *  the agent switches accounts between requests. Lines from agents that predate
 *  `id` and `account` cannot be told apart from API-key requests and are skipped.
 *  /clone and /worktree copy these lines into a new session, so `id` (the API's
 *  response id) is the dedup key, not anything per file. */
export function parseAgentLine(
	line: string,
	sessionCwd: string | null,
	sessionId: string | null,
): { accountExtId: string; record: UsageRecord } | null {
	let parsed: unknown
	try {
		parsed = JSON.parse(line)
	} catch {
		return null
	}
	if (typeof parsed !== 'object' || parsed === null) {
		return null
	}
	const o = parsed as Record<string, unknown>
	const id = str(o.id)
	const account = str(o.account)
	const at = new Date(typeof o.timestamp === 'number' ? o.timestamp : Number.NaN)
	if (o.type !== 'usage' || o.provider !== 'anthropic' || !id || !account || Number.isNaN(at.getTime())) {
		return null
	}
	const tokens = (v: unknown) => (typeof v === 'number' ? v : 0)
	return {
		accountExtId: account,
		record: {
			// Lines from agents before cache_write_1h are priced by the user's TTL setting.
			...cacheSplit(tokens(o.cache_write), o.cache_write_1h),
			cacheCreationTokens: tokens(o.cache_write),
			cacheReadTokens: tokens(o.cache_read),
			cwd: sessionCwd,
			gitBranch: null,
			inputTokens: tokens(o.input),
			messageId: id,
			model: str(o.model),
			outputTokens: tokens(o.output),
			requestId: null,
			serviceTier: null,
			sessionId,
			source: 'agent',
			timestamp: at.toISOString(),
			uuid: `agent:${id}`,
			version: null,
		},
	}
}

/**
 * Parse a single JSONL line. Returns a UsageRecord only for assistant messages
 * that carry a usage object; everything else (user/system/summary/tool/…) → null.
 * `uuid` is the per-line idempotency key the server dedups on. `source` tags which
 * app the file came from (the line itself carries no app identifier) and selects
 * the format: `pi` files use pi's own schema, everything else Claude Code's.
 * `sessionCwd` is the file-level working directory, used only by `pi`.
 */
export function parseLine(
	line: string,
	source: UsageSource = 'cli',
	sessionCwd: string | null = null,
): UsageRecord | null {
	const trimmed = line.trim()
	if (!trimmed) {
		return null
	}
	// JSON.parse is typed `any`, so a valid-JSON line that is not an object sails
	// past the try/catch. A bare `null` line then throws on the first property
	// access below, and that throw escapes tailFile and leaves the file's offset
	// unadvanced forever, silently dropping every later record in it. Numbers,
	// strings and arrays never threw (`(123).type` is just undefined); they are in
	// the guard so the `as Record<string, unknown>` cast below is not a lie.
	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch {
		return null
	}
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		return null
	}
	const o = parsed as Record<string, unknown>
	if (source === 'pi') {
		return parsePiLine(o, sessionCwd)
	}
	if (o.type !== 'assistant') {
		return null
	}
	const message = o.message as { id?: string; model?: string; usage?: RawUsage } | undefined
	if (!message || typeof message.usage !== 'object' || message.usage === null) {
		return null
	}
	const { uuid } = o
	if (typeof uuid !== 'string' || !uuid) {
		return null
	}

	const u = message.usage
	const cache = cacheCreation(u)
	return {
		cacheCreation1h: cache.oneHour,
		cacheCreation5m: cache.five,
		cacheCreationTokens: cache.total,
		cacheReadTokens: u.cache_read_input_tokens ?? 0,
		cwd: str(o.cwd),
		gitBranch: str(o.gitBranch),
		inputTokens: u.input_tokens ?? 0,
		messageId: str(message.id),
		model: str(message.model),
		outputTokens: u.output_tokens ?? 0,
		requestId: str(o.requestId),
		serviceTier: u.service_tier ?? null,
		sessionId: str(o.sessionId),
		source,
		timestamp: validTimestamp(o.timestamp),
		uuid,
		version: str(o.version),
	}
}
