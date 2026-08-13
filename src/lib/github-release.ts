// Server-side view of the collector's GitHub Releases. The repo is private, so
// devices cannot fetch assets themselves — the server holds the one GitHub
// credential and proxies downloads, which keeps the collector free of `gh` and
// of any GitHub auth at all.

const REPO = process.env.GITHUB_REPO ?? "rokartur/usagefleet";
const SUMS_ASSET = "SHA256SUMS.txt";

export interface ReleaseAsset {
  name: string;
  id: number;
}
export interface LatestRelease {
  tag: string;
  assets: ReleaseAsset[];
  /** asset name → sha256, from the release's SHA256SUMS.txt. */
  sha256: Record<string, string>;
}

/** Thrown when the deployment has no GITHUB_TOKEN, or GitHub says no. The
 *  routes turn this into a 503 so collectors quietly skip the update. */
export class ReleaseUnavailable extends Error {}

const OCTET = "application/octet-stream";
const assetPath = (assetId: number) => `/repos/${REPO}/releases/assets/${assetId}`;

function token(): string {
  const t = process.env.GITHUB_TOKEN;
  if (!t) throw new ReleaseUnavailable("GITHUB_TOKEN is not set");
  return t;
}

/** `revalidate` is for small JSON only — asset bodies are far past the data
 *  cache's size limit and must stream straight through. */
async function gh(path: string, accept: string, revalidate?: number): Promise<Response> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      accept,
      authorization: `Bearer ${token()}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "usagefleet",
    },
    ...(revalidate === undefined
      ? { cache: "no-store" as const }
      : // Releases move rarely and every device polls daily; let the platform
        // collapse that into one upstream request per minute.
        { next: { revalidate } }),
  });
  if (!res.ok) throw new ReleaseUnavailable(`GitHub ${path} → ${res.status}`);
  return res;
}

/** `<sha>  <name>` lines, as produced by sha256sum. */
export function parseSha256Sums(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]{64})\s+\*?(\S+)$/.exec(line.trim());
    if (m) out[m[2] as string] = m[1] as string;
  }
  return out;
}

export async function latestRelease(): Promise<LatestRelease> {
  const res = await gh(`/repos/${REPO}/releases/latest`, "application/vnd.github+json", 60);
  const release = (await res.json()) as {
    tag_name?: string;
    assets?: Array<{ name?: string; id?: number }>;
  };
  const assets: ReleaseAsset[] = (release.assets ?? [])
    .filter((a): a is ReleaseAsset => typeof a.name === "string" && typeof a.id === "number")
    .map((a) => ({ name: a.name, id: a.id }));
  if (!release.tag_name || assets.length === 0) throw new ReleaseUnavailable("no assets");

  const sums = assets.find((a) => a.name === SUMS_ASSET);
  return {
    tag: release.tag_name,
    assets,
    sha256: sums ? parseSha256Sums(await (await gh(assetPath(sums.id), OCTET, 60)).text()) : {},
  };
}

/** Raw bytes of a release asset. GitHub 302s to a signed storage URL; undici
 *  drops the Authorization header across that origin change, which is exactly
 *  what the storage backend requires. */
export function assetBody(assetId: number): Promise<Response> {
  return gh(assetPath(assetId), OCTET);
}
