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
function str(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null
}

/** A valid ISO-ish timestamp string, else the current time (never an invalid one). */
function validTimestamp(v: unknown): string {
	if (typeof v === 'string' && !Number.isNaN(new Date(v).getTime())) {
		return v
	}
	return new Date().toISOString()
}

function cacheCreation(u: RawUsage): number {
	if (typeof u.cache_creation_input_tokens === 'number') {
		return u.cache_creation_input_tokens
	}
	const c = u.cache_creation
	if (c) {
		return (c.ephemeral_5m_input_tokens ?? 0) + (c.ephemeral_1h_input_tokens ?? 0)
	}
	return 0
}

/** pi agent session line: `{type:"message", id, timestamp, message:{role:"assistant",
 *  provider, model, responseId, usage:{input, output, cacheRead, cacheWrite}}}`.
 *  Only provider "anthropic" hits the user's Claude account — other providers
 *  (openai-codex, openrouter, …) are skipped. `output` already includes reasoning
 *  tokens (totalTokens = input + output + cacheRead + cacheWrite). */
function parsePiLine(o: Record<string, unknown>): UsageRecord | null {
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
				}
		  }
		| undefined
	if (!m || m.role !== 'assistant' || m.provider !== 'anthropic') {
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
		cacheCreationTokens: u.cacheWrite ?? 0,
		cacheReadTokens: u.cacheRead ?? 0,
		cwd: null,
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

/**
 * Parse a single JSONL line. Returns a UsageRecord only for assistant messages
 * that carry a usage object; everything else (user/system/summary/tool/…) → null.
 * `uuid` is the per-line idempotency key the server dedups on. `source` tags which
 * app the file came from (the line itself carries no app identifier) and selects
 * the format: `pi` files use pi's own schema, everything else Claude Code's.
 */
export function parseLine(line: string, source: UsageSource = 'cli'): UsageRecord | null {
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
		return parsePiLine(o)
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
	return {
		cacheCreationTokens: cacheCreation(u),
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
