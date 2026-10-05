// Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
//
// Voices every CAMPAIGN clip that has no wav yet (ElevenLabs, BRAND.voice) and
// prints its duration and chars/s. Existing clips are kept, so a rerun only
// bills new lines and shipped videos keep the take they shipped with; delete a
// wav to re-take it. The average chars/s of a video's five clips is its
// `charsPerSecond` in campaign.ts (only read for clips without timings). Every
// clip also gets a `.json` of word timings next to the wav; captions time off it.
// Line text goes to ElevenLabs; never put anything private in it.
// Usage: ELEVENLABS_API_KEY=... bun scripts/vo.ts
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { BRAND } from '../src/brand'
import { CAMPAIGN } from '../src/campaign'
import type { Video, WordTiming } from '../src/kit'
import { cardTimings, parseCards, spokenText, timedCaptionChunks, wordTimingsSrc } from '../src/kit'

// Anchor on the workspace like the .sh scripts do: run from a monorepo root,
// every clip would look missing and be billed again.
process.chdir(fileURLToPath(new URL('..', import.meta.url)))

const videos: readonly Video[] = CAMPAIGN

interface Alignment {
	characters: string[]
	character_start_times_seconds: number[]
	character_end_times_seconds: number[]
}

// Characters between whitespace form a word; its span is first to last character.
function wordTimings({ characters, character_start_times_seconds, character_end_times_seconds }: Alignment) {
	const words: WordTiming[] = []
	let open: WordTiming | undefined
	for (const [i, char] of characters.entries()) {
		if (/\s/.test(char)) {
			open = undefined
		} else if (open) {
			open.end = character_end_times_seconds[i]
		} else {
			open = { end: character_end_times_seconds[i], start: character_start_times_seconds[i] }
			words.push(open)
		}
	}
	return words
}

async function speak(text: string, out: string) {
	const key = process.env.ELEVENLABS_API_KEY
	if (!key) {
		throw new Error('set ELEVENLABS_API_KEY')
	}
	const res = await fetch(
		`https://api.elevenlabs.io/v1/text-to-speech/${BRAND.voice.id}/with-timestamps?output_format=mp3_44100_128`,
		{
			body: JSON.stringify({ model_id: BRAND.voice.model, text }),
			headers: { 'content-type': 'application/json', 'xi-api-key': key },
			method: 'POST',
			// A stalled connection would otherwise hang the run with no output.
			signal: AbortSignal.timeout(60_000),
		},
	)
	if (!res.ok) {
		// The reason (quota, model not on plan, bad voice) is in the body.
		throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`)
	}
	const { alignment, audio_base64 } = (await res.json()) as { alignment: Alignment; audio_base64: string }
	// Encode to a temp name: a half-written wav would otherwise count as a finished take on the next run.
	execFileSync(
		'ffmpeg',
		[
			'-y',
			'-loglevel',
			'error',
			'-i',
			'pipe:0',
			'-af',
			'loudnorm=I=-15:TP=-1.5',
			'-ar',
			'44100',
			'-ac',
			'1',
			`${out}.tmp.wav`,
		],
		{ input: Buffer.from(audio_base64, 'base64') },
	)
	await rename(`${out}.tmp.wav`, out)
	return wordTimings(alignment)
}

await mkdir('public/vo', { recursive: true })
for (const video of videos) {
	for (const clip of video.clips) {
		const out = `public/${clip.src}`
		if (existsSync(out)) {
			continue
		}
		// Screencast and panel clips are card scripts, timed per word.
		const cardScript = video.screen !== undefined || video.panel !== undefined
		const words = await speak(clip.say ?? (cardScript ? spokenText(clip.text) : clip.text), out)
		// Fails here, not mid-render, when the voice merged or split a word (or `say`
		// has a different word count than `text`). The wav goes too, so the fixed
		// line is re-taken instead of skipped on the rerun.
		try {
			if (cardScript) {
				cardTimings(parseCards(clip.text), words)
			} else {
				timedCaptionChunks(clip.text, words)
			}
		} catch (error) {
			await unlink(out)
			throw error
		}
		await writeFile(`public/${wordTimingsSrc(clip.src)}`, JSON.stringify(words))
		const seconds = Number(
			execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], {
				encoding: 'utf-8',
			}),
		)
		// Rate over the caption text, since that is what captionChunks times.
		console.log(`${clip.src}\t${seconds.toFixed(2)}s\t${(clip.text.length / seconds).toFixed(1)} chars/s`)
	}
}
