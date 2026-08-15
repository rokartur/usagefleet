// Server-side view of the collector's GitHub Releases. The repo is private, so
// devices cannot fetch assets themselves — the server holds the one GitHub
// credential and proxies downloads, which keeps the collector free of `gh` and
// of any GitHub auth at all.

import { createPromiseCache } from '@/lib/promise-cache'

const REPO = process.env.GITHUB_REPO ?? 'rokartur/usagefleet'
const SUMS_ASSET = 'SHA256SUMS.txt'

export interface ReleaseAsset {
	name: string
	id: number
}
export interface LatestRelease {
	tag: string
	assets: ReleaseAsset[]
	/** asset name → sha256, from the release's SHA256SUMS.txt. */
	sha256: Record<string, string>
}

/** Thrown when the deployment has no GITHUB_TOKEN, or GitHub says no. The
 *  routes turn this into a 503 so collectors quietly skip the update. */
export class ReleaseUnavailable extends Error {}

const OCTET = 'application/octet-stream'
const assetPath = (assetId: number) => `/repos/${REPO}/releases/assets/${assetId}`

function token(): string {
	const t = process.env.GITHUB_TOKEN
	if (!t) {
		throw new ReleaseUnavailable('GITHUB_TOKEN is not set')
	}
	return t
}

/** Metadata calls are small and sit in front of a shared promise cache, so a hung
 *  connection would stall every waiter for the whole TTL with nothing to clear it
 *  (the failure cleanup only runs on rejection, and a hang never rejects). Asset
 *  bodies opt out: aborting mid-stream would break a slow but healthy download. */
const META_TIMEOUT_MS = 10_000

async function gh(path: string, accept: string, timeoutMs?: number): Promise<Response> {
	const auth = `Bearer ${token()}` // hoisted: its own ReleaseUnavailable is already right
	let res: Response
	try {
		res = await fetch(`https://api.github.com${path}`, {
			cache: 'no-store',
			headers: {
				accept,
				authorization: auth,
				'user-agent': 'usagefleet',
				'x-github-api-version': '2022-11-28',
			},
			signal: timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs),
		})
	} catch (error) {
		// A timeout rejects with a DOMException and a dropped connection with a
		// TypeError; neither is a ReleaseUnavailable, so without this both sail past
		// the `instanceof` checks in the routes and 500 a public endpoint instead of
		// returning the documented 503.
		throw new ReleaseUnavailable(`GitHub ${path} → ${error instanceof Error ? error.name : 'network error'}`)
	}
	if (!res.ok) {
		throw new ReleaseUnavailable(`GitHub ${path} → ${res.status}`)
	}
	return res
}

/** `<sha>  <name>` lines, as produced by sha256sum. */
export function parseSha256Sums(text: string): Record<string, string> {
	const out: Record<string, string> = {}
	for (const line of text.split('\n')) {
		const m = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim())
		if (m) {
			out[m[2] as string] = m[1] as string
		}
	}
	return out
}

const cachedRelease = createPromiseCache(60_000, fetchLatestRelease)

/**
 * The latest release, cached for a minute.
 *
 * Releases move rarely but every device polls every 6h and each lookup costs two
 * GitHub API calls, so uncached this makes the 5000/hr token quota the real
 * ceiling on fleet size — and once it is spent, every install and self-update
 * fails.
 */
export function latestRelease(): Promise<LatestRelease> {
	return cachedRelease(REPO)
}

async function fetchLatestRelease(): Promise<LatestRelease> {
	const res = await gh(`/repos/${REPO}/releases/latest`, 'application/vnd.github+json', META_TIMEOUT_MS)
	// The abort signal covers the body too, so a stalled read rejects here rather
	// than at the fetch — same reason as in `gh`, it must not escape as a 500.
	const release = (await readOrUnavailable(res, r => r.json())) as {
		tag_name?: string
		assets?: { name?: string; id?: number }[]
	}
	const assets: ReleaseAsset[] = (release.assets ?? [])
		.filter((a): a is ReleaseAsset => typeof a.name === 'string' && typeof a.id === 'number')
		.map(a => ({ id: a.id, name: a.name }))
	if (!release.tag_name || assets.length === 0) {
		throw new ReleaseUnavailable('no assets')
	}

	const sums = assets.find(a => a.name === SUMS_ASSET)
	return {
		assets,
		sha256: sums
			? parseSha256Sums(
					await readOrUnavailable(await gh(assetPath(sums.id), OCTET, META_TIMEOUT_MS), r => r.text()),
				)
			: {},
		tag: release.tag_name,
	}
}

async function readOrUnavailable<T>(res: Response, read: (res: Response) => Promise<T>) {
	try {
		return await read(res)
	} catch (error) {
		throw new ReleaseUnavailable(`GitHub body → ${error instanceof Error ? error.name : 'read failed'}`)
	}
}

/** Raw bytes of a release asset. GitHub 302s to a signed storage URL; undici
 *  drops the Authorization header across that origin change, which is exactly
 *  what the storage backend requires. */
function assetBody(assetId: number): Promise<Response> {
	return gh(assetPath(assetId), OCTET)
}

/**
 * The named asset of the latest release, streamed back as a download response,
 * including the 400/404/503 cases.
 *
 * The two collector download routes serve exactly these bytes and differ only
 * in how they authorize the caller, so the GitHub side lives here once.
 */
export async function serveLatestAsset(name: string | null): Promise<Response> {
	if (!name) {
		return Response.json({ error: 'missing asset' }, { status: 400 })
	}

	try {
		// The release's own asset list is the allowlist — an exact-name lookup, so
		// the parameter can never reach GitHub as an arbitrary path.
		const release = await latestRelease()
		const asset = release.assets.find(a => a.name === name)
		if (!asset) {
			return Response.json({ error: 'unknown asset' }, { status: 404 })
		}

		const upstream = await assetBody(asset.id)
		const length = upstream.headers.get('content-length')
		return new Response(upstream.body, {
			headers: {
				'cache-control': 'no-store',
				'content-disposition': `attachment; filename="${asset.name}"`,
				'content-type': 'application/octet-stream',
				...(length ? { 'content-length': length } : {}),
			},
		})
	} catch (error) {
		if (error instanceof ReleaseUnavailable) {
			return Response.json({ error: 'no release available' }, { status: 503 })
		}
		throw error
	}
}
