#!/usr/bin/env bash
# Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
#
# Cuts public/gameplay/mc-<N>.mp4, the muted retention strip under video N:
# 15.4 s at 1080x560 @ 30 fps. Each video takes its own 20 s slice of the
# source so no two videos share footage. No-op when the strip already exists.
# Usage: scripts/strip.sh <N>
set -euo pipefail
cd "$(dirname "$0")/.."

n=$1
out="public/gameplay/mc-$n.mp4"
if [ -e "$out" ]; then
	echo "$out exists"
	exit 0
fi

mkdir -p public/gameplay
src="/tmp/strip-src-$n.mp4"
start=$((60 + (n - 1) * 20))
if [ ! -e "$src" ]; then
	# --print names the footage in the run report; without --no-simulate it would skip the download.
	uvx yt-dlp -f 'bv*[height>=1000]' -S 'res:1440' --download-sections "*$start-$((start + 20))" \
		--no-simulate --print webpage_url \
		-o "$src" "ytsearch1:${STRIP_QUERY:-gta 5 car falling off mountain gameplay no copyright 4k}"
fi
ffmpeg -y -loglevel error -ss 2 -t 15.4 -i "$src" -vf 'scale=1080:-2,crop=1080:560' -r 30 -an -c:v libx264 -crf 20 "$out"

# A source shorter than the slice makes ffmpeg exit 0 on a strip that ends early,
# and the no-op above would then keep it forever.
if ! awk -v d="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out")" 'BEGIN { exit !(d > 15.3) }'; then
	rm -f "$out" "$src"
	echo "source too short for slice $n, retry (the search result may be a Short)" >&2
	exit 1
fi
echo "$out"
