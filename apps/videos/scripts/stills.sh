#!/usr/bin/env bash
# Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
#
# Six check frames as 432 px thumbs in out/chk-<frame>.png: the middle of each
# scene plus the first crossfade. Look at every one before rendering.
# Usage: scripts/stills.sh <CompositionId> [frame ...]
set -euo pipefail
cd "$(dirname "$0")/.."

id=$1
shift
frames=("$@")
if [ ${#frames[@]} -eq 0 ]; then
	frames=(45 84 130 215 300 400)
fi

# Panel takes compose at half size, so their thumbs need twice the scale to match.
scale=$(bun -e 'import { CAMPAIGN } from "./src/campaign"; console.log(CAMPAIGN.find(v => v.id === process.argv[1])?.panel ? 0.8 : 0.4)' "$id")

mkdir -p out
for frame in "${frames[@]}"; do
	bunx remotion still src/index.ts "$id" "out/chk-$frame.png" --frame="$frame" --scale="$scale" --log=error
	echo "out/chk-$frame.png"
done
