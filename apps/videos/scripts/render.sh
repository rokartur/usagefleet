#!/usr/bin/env bash
# Render a composition and normalize the mix to platform loudness (-14 LUFS).
# Usage: scripts/render.sh <CompositionId> <out.mp4>
set -euo pipefail
cd "$(dirname "$0")/.."

bunx remotion render src/index.ts "$1" "$2" --codec=h264 --crf=18
ffmpeg -y -loglevel error -i "$2" -c:v copy -af "loudnorm=I=-14:TP=-1" -c:a aac -b:a 192k "$2.tmp.mp4"
mv "$2.tmp.mp4" "$2"
