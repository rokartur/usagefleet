import { createHash, randomBytes } from 'node:crypto'

const PREFIX = 'uf_'

export function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex')
}

/** Generate a new device token. The plaintext is shown to the user exactly
 *  once; only `tokenHash` is persisted. `tokenPrefix` is a non-secret label. */
export function generateDeviceToken(): {
	token: string
	tokenHash: string
	tokenPrefix: string
} {
	const token = PREFIX + randomBytes(24).toString('base64url')
	return {
		token,
		tokenHash: hashToken(token),
		tokenPrefix: token.slice(0, 12),
	}
}
