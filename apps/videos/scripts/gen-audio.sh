#!/usr/bin/env bash
# Generates all SFX + music bed (ffmpeg synthesis) and VO (edge-tts neural
# voice — needs network; the script text goes to Microsoft's TTS endpoint).
set -euo pipefail
cd "$(dirname "$0")/.."

mkdir -p public/sfx public/vo
VOICE="en-US-AndrewNeural"
RATE="+12%"

sfx() { # name, filter args
	local name=$1
	shift
	ffmpeg -y -loglevel error "$@" "public/sfx/$name.wav"
	echo "sfx/$name.wav"
}

# whoosh: pink noise burst, band-swept feel via fades
sfx whoosh -f lavfi -i "anoisesrc=color=pink:duration=0.55:amplitude=0.7" \
	-af "bandpass=f=750:w=900,afade=t=in:d=0.16,afade=t=out:st=0.2:d=0.35,volume=2.2"

# pop: short bright blip for element reveals
sfx pop -f lavfi -i "sine=frequency=1500:duration=0.09" \
	-af "afade=t=in:d=0.005,afade=t=out:st=0.02:d=0.07,volume=0.9"

# hit: low thud for impact beats
sfx hit -f lavfi -i "sine=frequency=68:duration=0.45" -f lavfi -i "anoisesrc=color=white:duration=0.05:amplitude=0.4" \
	-filter_complex "[0]afade=t=out:st=0.05:d=0.4[a];[1]lowpass=f=2000,afade=t=out:d=0.05[b];[a][b]amix=inputs=2,volume=2.6"

# ding: end-card chime, two decaying partials
sfx ding -f lavfi -i "sine=frequency=880:duration=0.8" -f lavfi -i "sine=frequency=1318:duration=0.8" \
	-filter_complex "[0][1]amix=inputs=2,afade=t=out:st=0.05:d=0.75,volume=0.7"

# music: minimal dark pulse bed — sub bass on quarters, shaker-ish noise on
# eighths, quiet harmonic layer. Sits far under the VO.
sfx music -f lavfi -i "sine=frequency=55:duration=15.4" \
	-f lavfi -i "anoisesrc=color=white:duration=15.4:amplitude=0.12" \
	-f lavfi -i "sine=frequency=110:duration=15.4" \
	-filter_complex "[0]tremolo=f=2:d=0.85,volume=1.0[bass];[1]highpass=f=9000,tremolo=f=4:d=1,volume=0.22[hat];[2]tremolo=f=0.5:d=0.5,volume=0.28[pad];[bass][hat][pad]amix=inputs=3:normalize=0,afade=t=in:d=0.4,afade=t=out:st=13.6:d=1.8,volume=1.6"

vo() { # file, text
	uvx edge-tts --voice "$VOICE" --rate="$RATE" --text "$2" --write-media /tmp/vo.mp3
	ffmpeg -y -loglevel error -i /tmp/vo.mp3 -af "loudnorm=I=-15:TP=-1.5" -ar 44100 -ac 1 "public/vo/$1.wav"
	printf '%s\t%s\n' "vo/$1.wav" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "public/vo/$1.wav")"
}

vo v1-s1 "Claude limit: one hundred percent."
vo v1-s2 "Which machine did it? Stop guessing."
vo v1-s3 "UsageFleet splits Anthropic's official number across your machines. Live."
vo v1-s4 "No prompts. No responses. No file contents."
vo v1-s5 "UsageFleet dot com."

vo v2-s1 "Claude Code on multiple machines? One subscription."
vo v2-s2 "UsageFleet shows which machines are spending it."
vo v2-s3 "Usage and cost, split by device."
vo v2-s4 "Setup? Two commands."
vo v2-s5 "Nothing private leaves. UsageFleet dot com."
