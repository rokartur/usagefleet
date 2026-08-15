import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'
import { writeFileAtomic } from './atomic-write.js'

export interface ClaudeCreds {
	source: 'sub' | 'api'
	/** Subscription: OAuth access token (Bearer). API: the API key. */
	token: string
	subscriptionType?: string | null
}

interface OAuthBlob {
	claudeAiOauth?: {
		accessToken?: string
		refreshToken?: string
		expiresAt?: number
		subscriptionType?: string
	}
}

const KEYCHAIN_SERVICE = 'Claude Code-credentials'

function credentialsFilePath(): string {
	return join(homedir(), '.claude', '.credentials.json')
}

/** Linux/Windows (and sometimes macOS): ~/.claude/.credentials.json */
function fromCredentialsFile(): OAuthBlob | null {
	try {
		return JSON.parse(readFileSync(credentialsFilePath(), 'utf-8')) as OAuthBlob
	} catch {
		return null
	}
}

/** Set by the most recent fromMacKeychain() call so callers can distinguish a
 *  genuine "no login" from an access denial (common when the collector runs as a
 *  non-interactive launchd agent and the login Keychain read is refused). */
let macKeychainError: null | 'notfound' | 'denied' = null

/** True if the last Keychain read failed for a reason other than item-not-found
 *  (exit 44) — i.e. the item likely exists but access was denied. */
export function macKeychainDenied(): boolean {
	return macKeychainError === 'denied'
}

/** macOS: Claude Code stores the same JSON in the login Keychain. */
function fromMacKeychain(): OAuthBlob | null {
	if (process.platform !== 'darwin') {
		return null
	}
	macKeychainError = null
	try {
		const out = execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
			encoding: 'utf-8',
			stdio: ['ignore', 'pipe', 'ignore'],
		})
		return JSON.parse(out) as OAuthBlob
	} catch (error) {
		// `security` exits 44 (errSecItemNotFound) when there is genuinely no item;
		// any other non-zero status usually means the read was denied.
		const code = (error as { status?: number }).status
		macKeychainError = code === 44 ? 'notfound' : 'denied'
		return null
	}
}

/** Store the refreshed blob back where Claude Code keeps it, so the rotated
 *  refresh token stays in sync with the CLI (a rotation we dropped on the floor
 *  would log the user out of Claude Code). Throws if it can't be persisted. */
function persist(blob: OAuthBlob, from: 'file' | 'keychain'): void {
	const json = JSON.stringify(blob)
	if (from === 'file') {
		// Atomic: an interrupted write here truncates the user's live credentials
		// and logs them out of Claude Code entirely.
		writeFileAtomic(credentialsFilePath(), json, 0o600)
		return
	}
	// The password must go in argv: `security`'s stdin prompt reads at most 128
	// bytes and would silently store a truncated (unparseable) blob.
	execFileSync(
		'security',
		['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', userInfo().username, '-w', json],
		{ stdio: 'ignore' },
	)
	// Trust nothing: a partial write here means a broken Claude Code login.
	const stored = execFileSync('security', ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-w'], {
		encoding: 'utf-8',
		stdio: ['ignore', 'pipe', 'ignore'],
	}).trim()
	if (stored !== json) {
		throw new Error('keychain write did not round-trip')
	}
}

/** Claude Code's public OAuth client id — the same one the CLI refreshes with. */
const OAUTH_CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const OAUTH_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'

/** Trade the refresh token for a fresh access token. Access tokens live ~8h, so
 *  without this the collector goes dark whenever the user hasn't opened Claude
 *  Code for a few hours — the CLI is the only thing that would refresh it. */
async function refreshOauth(blob: OAuthBlob, from: 'file' | 'keychain'): Promise<ClaudeCreds | null> {
	const oauth = blob.claudeAiOauth
	if (!oauth?.refreshToken) {
		return null
	}
	const res = await fetch(OAUTH_TOKEN_URL, {
		body: JSON.stringify({
			client_id: OAUTH_CLIENT_ID,
			grant_type: 'refresh_token',
			refresh_token: oauth.refreshToken,
		}),
		headers: { 'content-type': 'application/json' },
		method: 'POST',
		signal: AbortSignal.timeout(15_000),
	})
	if (!res.ok) {
		return null
	}
	const tok = (await res.json()) as {
		access_token?: string
		refresh_token?: string
		expires_in?: number
	}
	if (!tok.access_token) {
		return null
	}
	try {
		persist(
			{
				...blob,
				claudeAiOauth: {
					...oauth,
					accessToken: tok.access_token,
					expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
					refreshToken: tok.refresh_token ?? oauth.refreshToken,
				},
			},
			from,
		)
	} catch (error) {
		// The refresh already rotated the token server-side, so the stored one is
		// now dead: keep using the new one in memory (valid for hours) and make the
		// failure loud — on restart the user will have to `claude login` again.
		console.error(
			`could not save the refreshed Claude token (${(error as Error).message}) — ` +
				'run `claude login` if limits stop reporting after a restart',
		)
	}
	return {
		source: 'sub',
		subscriptionType: oauth.subscriptionType ?? null,
		token: tok.access_token,
	}
}

/**
 * Auto-detect the local Claude login on THIS machine, with no manual entry:
 *   1. Subscription — OAuth from a `claude` (Claude Code) login, refreshed
 *      in place when the access token has expired.
 *   2. API key — ANTHROPIC_API_KEY env var.
 * Returns null if neither is present.
 */
export async function detectClaudeCreds(): Promise<ClaudeCreds | null> {
	const fileBlob = fromCredentialsFile()
	const blob = fileBlob ?? fromMacKeychain()
	const from = fileBlob ? 'file' : 'keychain'
	const oauth = blob?.claudeAiOauth
	// Only use the OAuth token if it isn't expired (60s skew margin).
	const exp = oauth?.expiresAt
	if (oauth?.accessToken && (exp == null || exp - 60_000 > Date.now())) {
		return {
			source: 'sub',
			subscriptionType: oauth.subscriptionType ?? null,
			token: oauth.accessToken,
		}
	}
	if (blob) {
		try {
			const refreshed = await refreshOauth(blob, from)
			if (refreshed) {
				return refreshed
			}
		} catch {
			/* refresh endpoint or keychain write failed — fall through to the API key */
		}
	}
	const apiKey = process.env.ANTHROPIC_API_KEY
	if (apiKey) {
		return { source: 'api', token: apiKey }
	}
	return null
}
