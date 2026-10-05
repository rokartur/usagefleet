#!/usr/bin/env bash
# Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
#
# Stages out/NN-<Id>.{mp4,png,txt} in TikTok Studio (default) or YouTube Studio
# through the user's own Chrome (playwriter extension, logged-in account). Never
# clicks Post/Publish: publishing is externally visible, so the last click stays
# manual.
# Usage: scripts/publish.sh <CompositionId> [tiktok|youtube]
set -euo pipefail
cd "$(dirname "$0")/.."

id=${1:?usage: scripts/publish.sh <CompositionId> [tiktok|youtube]}
target=${2:-tiktok}
case $target in
	tiktok) script=scripts/publish.js ;;
	youtube) script=scripts/publish-youtube.js ;;
	*) echo "unknown target $target (tiktok|youtube)" >&2; exit 1 ;;
esac
n=$(bun -e 'import { CAMPAIGN } from "./src/campaign"; for (const v of CAMPAIGN) console.log(v.id)' | awk -v id="$id" '$1 == id { print NR }')
[ -n "$n" ] || { echo "$id is not in CAMPAIGN" >&2; exit 1; }
base=$(printf '%s/out/%02d-%s' "$PWD" "$n" "$id")
for ext in mp4 png txt; do
	[ -f "$base.$ext" ] || { echo "$base.$ext missing, run scripts/render.sh $id" >&2; exit 1; }
done
channel=$(bun -e 'import { BRAND } from "./src/brand"; console.log(BRAND.youtubeChannel ?? "")')
[ "$target" != youtube ] || [ -n "$channel" ] || { echo 'BRAND.youtubeChannel missing in src/brand.tsx' >&2; exit 1; }

# The sandbox has no argv or env; it reads this file instead.
jq -n --arg mp4 "$base.mp4" --arg png "$base.png" --arg youtubeChannel "$channel" --rawfile post "$base.txt" \
	'{ mp4: $mp4, png: $png, youtubeChannel: $youtubeChannel, post: ($post | rtrimstr("\n")) }' >/tmp/usagefleet-publish.json

session=$(playwriter session new | sed -n 's/^Session \([0-9]*\) created.*/\1/p')
[ -n "$session" ] || { echo 'playwriter could not open a session; is Chrome running with the extension?' >&2; exit 1; }
trap 'playwriter session delete "$session" >/dev/null 2>&1 || true' EXIT

# Default sandbox budget is 10 s; the upload alone can take that on a slow link.
playwriter -s "$session" --timeout 180000 -f "$script"
