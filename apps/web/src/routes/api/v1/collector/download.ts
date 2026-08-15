import { createFileRoute } from '@tanstack/react-router'
import { authenticateDevice } from '@/lib/device-auth'
import { serveLatestAsset } from '@/lib/github-release'

/**
 * Streams one asset of the latest release to an authenticated device, so a
 * collector can self-update without a GitHub credential of its own.
 *
 * Tighter rate limit than the JSON routes: each hit is a ~60 MB proxy, and a
 * device only needs one per release. The unauthenticated first install goes
 * through /asset instead.
 */
async function GET(req: Request) {
	const auth = await authenticateDevice(req, 'collector-download', 5)
	if ('response' in auth) {
		return auth.response
	}

	return serveLatestAsset(new URL(req.url).searchParams.get('asset'))
}

export const Route = createFileRoute('/api/v1/collector/download')({
	server: {
		handlers: {
			GET: ({ request }) => GET(request),
		},
	},
})
