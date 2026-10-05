#!/usr/bin/env bash
# Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
#
# Synthesizes the SFX set and the music bed with ffmpeg: seeded noise, so a
# rerun is byte-identical; no network, no licensing. Sound grammar: hit on the
# hook beat (1.0), whoosh on every cut (0.6), pop on reveals (0.4-0.5), one
# ding on the EndCard (0.7), music under everything (0.32).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/sfx

sfx() { # name, filter args
	local name=$1
	shift
	ffmpeg -y -loglevel error "$@" "public/sfx/$name.wav"
	echo "sfx/$name.wav"
}

# whoosh: pink noise burst, band-swept feel via fades
sfx whoosh -f lavfi -i "anoisesrc=color=pink:seed=1:duration=0.55:amplitude=0.7" \
	-af "bandpass=f=750:w=900,afade=t=in:d=0.16,afade=t=out:st=0.2:d=0.35,volume=2.2"

# pop: short bright blip for element reveals
sfx pop -f lavfi -i "sine=frequency=1500:duration=0.09" \
	-af "afade=t=in:d=0.005,afade=t=out:st=0.02:d=0.07,volume=0.9"

# hit: low thud for impact beats
sfx hit -f lavfi -i "sine=frequency=68:duration=0.45" -f lavfi -i "anoisesrc=color=white:seed=1:duration=0.05:amplitude=0.4" \
	-filter_complex "[0]afade=t=out:st=0.05:d=0.4[a];[1]lowpass=f=2000,afade=t=out:d=0.05[b];[a][b]amix=inputs=2,volume=2.6"

# ding: end-card chime, two decaying partials
sfx ding -f lavfi -i "sine=frequency=880:duration=0.8" -f lavfi -i "sine=frequency=1318:duration=0.8" \
	-filter_complex "[0][1]amix=inputs=2,afade=t=out:st=0.05:d=0.75,volume=0.7"

# music: minimal dark pulse bed. Sub bass on quarters, shaker-ish noise on
# eighths, quiet harmonic layer. Sits far under the VO.
sfx music -f lavfi -i "sine=frequency=55:duration=15.4" \
	-f lavfi -i "anoisesrc=color=white:seed=1:duration=15.4:amplitude=0.12" \
	-f lavfi -i "sine=frequency=110:duration=15.4" \
	-filter_complex "[0]tremolo=f=2:d=0.85,volume=1.0[bass];[1]highpass=f=9000,tremolo=f=4:d=1,volume=0.22[hat];[2]tremolo=f=0.5:d=0.5,volume=0.28[pad];[bass][hat][pad]amix=inputs=3:normalize=0,afade=t=in:d=0.4,afade=t=out:st=13.6:d=1.8,volume=1.6"
