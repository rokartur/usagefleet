import type { NextRequest } from "next/server";
import { authenticateDevice } from "@/lib/device-auth";
import { assetBody, latestRelease, ReleaseUnavailable } from "@/lib/github-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams one asset of the latest release to an authenticated device, so a
 * collector can self-update without a GitHub credential of its own.
 *
 * Tighter rate limit than the JSON routes: each hit is a ~60 MB proxy, and a
 * device only needs one per release.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateDevice(req, "collector-download", 5);
  if ("response" in auth) return auth.response;

  const wanted = req.nextUrl.searchParams.get("asset");
  if (!wanted) return Response.json({ error: "missing asset" }, { status: 400 });

  try {
    // The release's own asset list is the allowlist — an exact-name lookup, so
    // the parameter can never reach GitHub as an arbitrary path.
    const release = await latestRelease();
    const asset = release.assets.find((a) => a.name === wanted);
    if (!asset) return Response.json({ error: "unknown asset" }, { status: 404 });

    const upstream = await assetBody(asset.id);
    const length = upstream.headers.get("content-length");
    return new Response(upstream.body, {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${asset.name}"`,
        "cache-control": "no-store",
        ...(length ? { "content-length": length } : {}),
      },
    });
  } catch (err) {
    if (err instanceof ReleaseUnavailable) {
      return Response.json({ error: "no release available" }, { status: 503 });
    }
    throw err;
  }
}
