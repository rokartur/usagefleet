#!/usr/bin/env bash
# Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
#
# Instant voice clone on ElevenLabs from one or more recordings of the speaker
# (any ffmpeg-readable file, speech only, 1-3 minutes total is plenty). Prints
# the voice id to put in BRAND.voice. Needs a paid plan: the free tier answers 402.
# Usage: ELEVENLABS_API_KEY=... scripts/clone-voice.sh <name> <recording>...
set -euo pipefail

name=${1:?usage: scripts/clone-voice.sh <name> <recording>...}
shift
[ $# -gt 0 ] || { echo 'give at least one recording' >&2; exit 1; }
: "${ELEVENLABS_API_KEY:?set ELEVENLABS_API_KEY}"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

files=()
for recording in "$@"; do
	sample="$tmp/$(basename "${recording%.*}").mp3"
	ffmpeg -y -loglevel error -i "$recording" -vn -ac 1 -ar 44100 -b:a 192k "$sample"
	files+=(-F "files=@$sample")
done

curl -sS -X POST https://api.elevenlabs.io/v1/voices/add \
	-H "xi-api-key: $ELEVENLABS_API_KEY" \
	-F "name=$name" -F remove_background_noise=true "${files[@]}"
echo
