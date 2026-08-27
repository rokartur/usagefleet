// Writes the upload sidecars for every video: an .srt with the same caption
// timing the renderer burns in, and a .txt with the post copy.
// Usage: bun scripts/captions.ts
import { mkdir, writeFile } from 'node:fs/promises'
import { CAMPAIGN, captionChunks, FPS } from '../src/vo'

function timecode(frame: number) {
	const ms = Math.round((frame / FPS) * 1000)
	const pad = (value: number, width = 2) => String(value).padStart(width, '0')

	return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`
}

function srt(clips: (typeof CAMPAIGN)[number]['clips']) {
	const cues = clips.flatMap(clip =>
		captionChunks(clip.text).map(chunk => ({
			from: clip.at + chunk.from,
			text: chunk.text,
			to: clip.at + chunk.to,
		})),
	)

	return cues.map((cue, i) => `${i + 1}\n${timecode(cue.from)} --> ${timecode(cue.to)}\n${cue.text}\n`).join('\n')
}

await mkdir('out', { recursive: true })
for (const [index, video] of CAMPAIGN.entries()) {
	const base = `out/${String(index + 1).padStart(2, '0')}-${video.id}`
	await writeFile(`${base}.srt`, srt(video.clips))
	await writeFile(`${base}.txt`, `${video.post}\n`)
	console.log(`${base}.srt + ${base}.txt`)
}
