import { createFileRoute } from '@tanstack/react-router'
import { authenticateDevice } from '@/lib/device-auth'
import { latestRelease, ReleaseUnavailable } from '@/lib/github-release'

/**
 * What the newest collector release is, for `usagefleet update`. Devices
 * compare `tag` against the one baked into their binary and pull the matching
 * asset from /api/v1/collector/download.
 *
 * 503 (rather than an error) whenever the deployment has no GITHUB_TOKEN or
 * GitHub is unhappy: a collector treats any non-200 as "nothing to do".
 */
async function GET(req: Request) {
	const auth = await authenticateDevice(req, 'collector-latest')
	if ('response' in auth) {
		return auth.response
	}

	try {
		const release = await latestRelease()
		return Response.json(
			{
				tag: release.tag,
				assets: release.assets.map(a => a.name),
				sha256: release.sha256,
			},
			{ headers: { 'cache-control': 'no-store' } },
		)
	} catch (error) {
		if (error instanceof ReleaseUnavailable) {
			return Response.json({ error: 'no release available' }, { status: 503 })
		}
		throw error
	}
}

export const Route = createFileRoute('/api/v1/collector/latest')({
	server: {
		handlers: {
			GET: ({ request }) => GET(request),
		},
	},
})
