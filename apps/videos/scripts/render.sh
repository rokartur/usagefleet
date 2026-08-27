#!/usr/bin/env bash
# Render composition(s) to out/: an mp4 normalized to platform loudness
# (-14 LUFS) plus a PNG thumbnail.
# Usage: scripts/render.sh [CompositionId ...]   (no args = every composition)
set -euo pipefail
cd "$(dirname "$0")/.."

# Hook-scene punchline in every video — the moment worth putting on the cover.
THUMB_FRAME=${THUMB_FRAME:-40}

# Registration order in Root.tsx is the campaign order (v1…v6 in public/vo), so
# it also numbers the files — out/03-BuiltTheUsageView.mp4 is video 3.
read -ra all <<<"$(bunx remotion compositions src/index.ts --quiet | tail -1)"
ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then
	ids=("${all[@]}")
fi

mkdir -p out
for id in "${ids[@]}"; do
	n=1
	for known in "${all[@]}"; do
		if [ "$known" = "$id" ]; then break; fi
		n=$((n + 1))
	done
	out=$(printf 'out/%02d-%s' "$n" "$id")

	bunx remotion render src/index.ts "$id" "$out.mp4" --codec=h264 --crf=18
	ffmpeg -y -loglevel error -i "$out.mp4" -c:v copy -af "loudnorm=I=-14:TP=-1" -c:a aac -b:a 192k "$out.tmp.mp4"
	mv "$out.tmp.mp4" "$out.mp4"
	bunx remotion still src/index.ts "$id" "$out.png" --frame="$THUMB_FRAME"
	echo "$out.mp4 + $out.png"
done
