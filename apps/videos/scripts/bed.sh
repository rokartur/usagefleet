#!/usr/bin/env bash
# Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
#
# Fetches public/sfx/drive.wav, the music bed under every video: 60 s of a
# no-copyright electronic track at -18 LUFS (the synthesized pulse in sfx.sh
# read as silence between lines). Longer than any video, so no fade; the cut
# ends it. No-op when the bed already exists.
# Usage: scripts/bed.sh
set -euo pipefail
cd "$(dirname "$0")/.."

out=public/sfx/drive.wav
if [ -e "$out" ]; then
	echo "$out exists"
	exit 0
fi

mkdir -p public/sfx
src=/tmp/bed-src.webm
if [ ! -e "$src" ]; then
	uvx yt-dlp -f ba --download-sections '*20-90' --no-simulate --print webpage_url \
		-o "$src" "${BED_URL:-https://www.youtube.com/watch?v=Lef6w0FOqTk}"
fi
ffmpeg -y -loglevel error -ss 2 -t 60 -i "$src" -af 'loudnorm=I=-18:TP=-2' -ar 44100 -ac 2 "$out"
echo "$out"
