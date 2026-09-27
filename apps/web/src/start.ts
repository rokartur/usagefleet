import { createStart } from '@tanstack/react-start'

// Cloudflare answers a down origin (521 etc.) with JSON when Accept lists
// application/json, and Start's client returns any unserialized JSON as the
// function's result. Only Start's own errors carry x-tss-serialized.
export const startInstance = createStart(() => ({
	serverFns: {
		fetch: async (input, init) => {
			const response = await fetch(input, init)
			if (response.status >= 500 && !response.headers.has('x-tss-serialized')) {
				throw new Error(`Server unavailable (${response.status})`)
			}
			return response
		},
	},
}))
