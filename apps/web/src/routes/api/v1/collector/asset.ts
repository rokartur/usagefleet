import { createFileRoute } from '@tanstack/react-router'
import { serveLatestAsset } from '@/lib/github-release'
import { clientIp, rateLimit, tooMany } from '@/lib/rate-limit'

/**
 * Public, unauthenticated download of one asset from the latest release.
 *
 * This exists so `curl -sSL https://usagefleet.com/install.sh | sh` works on a
 * machine that has no device token yet: the source repo stays private, only the
 * compiled binary and its checksum file are public. Already-installed
 * collectors self-update through /download, which is keyed on the device token.
 *
 * Each hit proxies tens of megabytes and burns GitHub API quota, hence the
 * throttle. Careful: `clientIp` falls back to a single shared bucket unless
 * TRUST_PROXY is set, so a public deployment behind a reverse proxy must set
 * TRUST_PROXY or this limit applies to all callers at once.
 */
async function GET(req: Request) {
	const rl = rateLimit(`collector-asset:${clientIp(req)}`, 30, 10 * 60_000)
	if (!rl.ok) {
		return tooMany(rl.retryAfter)
	}

	return serveLatestAsset(new URL(req.url).searchParams.get('asset'))
}

export const Route = createFileRoute('/api/v1/collector/asset')({
	server: {
		handlers: {
			GET: ({ request }) => GET(request),
		},
	},
})
