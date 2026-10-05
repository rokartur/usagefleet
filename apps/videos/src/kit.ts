// Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
//
// Campaign timeline shared by the renderer (burned-in captions), the .srt
// sidecars and the voiceover script, so one line's audio, text and timing
// cannot drift apart.
import type { ComponentType } from 'react'

export const FPS = 30
// 15.0 s exactly: 5 scenes on the grid 0-90, 82-176, 168-264, 256-356, 348-450.
export const DURATION_FRAMES = 450

export interface Clip {
	/** Absolute frame the clip starts on: where the visual it voices lands, not the scene boundary. */
	at: number
	/** Path under public/: `vo/v<N>-s<1..5>.wav`. */
	src: string
	/** Caption text, digits not words. Also the spoken line unless `say` is set. */
	text: string
	/** Spoken form when it must differ from the caption: audio tags, spelled-out URLs. */
	say?: string
}

export interface Shot {
	/** Frame the cut lands on. */
	at: number
	/** Recording frame the shot resumes from; defaults to `at`. Later than that skips dead time. */
	from?: number
	/** Focus point, 0..1 of the cover-fitted recording as the stills show it. */
	x: number
	y: number
	/** 1 = the recording cover-fitted to the frame; the reference edit sits at 1.6-2.4. */
	scale: number
	/** Caption card anchor, 0..1 of the frame height. Keep it off what the shot is showing. */
	captionY?: number
}

export interface Screen {
	/** Path under public/: `screen/<N>.mp4`. Portrait; the sides of a landscape recording are cropped away. */
	src: string
	shots: readonly Shot[]
}

/** One stop of the panel take: the cursor glides to `text`, the camera cuts to it. */
export interface PanelShot {
	/** Frame the cut lands on. */
	at: number
	/** Exact text of the element to focus; `nth` picks between repeats (0-based, document order). */
	text: string
	nth?: number
	/** 1 = the panel at its natural width; the reference edit sits at 1.6-2.4. */
	scale: number
	/** Caption card anchor, 0..1 of the frame height. Keep it off what the shot is showing. */
	captionY?: number
	/** Click ring on arrival. Visual only; the panel's state never changes. */
	click?: boolean
}

export interface Panel {
	shots: readonly PanelShot[]
}

export interface Video {
	/** Composition id, PascalCase. */
	id: string
	/** The hook device in a few words. No two videos in a campaign share one. */
	hook: string
	/** Frame the cover PNG is taken from. */
	cover: number
	/** Measured voice rate for this video's clips (scripts/vo.ts prints it). Captions time off it. */
	charsPerSecond: number
	clips: readonly Clip[]
	/**
	 * Screencast format: one clip voicing a card script over a screen recording,
	 * captions timed by ElevenLabs word timestamps. Without it, the card format.
	 */
	screen?: Screen
	/**
	 * Panel format: the same edit over the product's own React components with
	 * a simulated cursor, no recording. The workspace's Root supplies the tree.
	 */
	panel?: Panel
	/** Post copy: hook line, two short paragraphs, URL, hashtags. */
	post: string
}

export type ScreenVideo = Video & { screen: Screen }
export type PanelVideo = Video & { panel: Panel }

export function isScreenVideo(video: Video): video is ScreenVideo {
	return video.screen !== undefined
}

export function isPanelVideo(video: Video): video is PanelVideo {
	return video.panel !== undefined
}

export interface CaptionWord {
	text: string
	accent: boolean
}

/** One on-screen caption: a word per line, an optional sticker. */
export interface Card {
	words: CaptionWord[]
	emoji?: string
}

/** Where scripts/vo.ts leaves a screencast clip's word timings: next to the wav. */
export function wordTimingsSrc(clipSrc: string) {
	return clipSrc.replace(/\.wav$/, '.json')
}

/** Seconds into the clip, from ElevenLabs alignment; one per spoken word. */
export interface WordTiming {
	start: number
	end: number
}

// A pictograph, then any run of pictographs, skin tones, ZWJ and VS16 (the
// parts a compound emoji like 👨‍💻 is made of).
const EMOJI_TOKEN = /^\p{Extended_Pictographic}(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200D|\uFE0F)*$/u

// Card script: a space separates cards, `_` joins words onto one card (one per
// line), `*word*` takes an accent colour, a standalone emoji sticks to the card
// before it. `spokenText` is what goes to ElevenLabs, so its words line up one
// to one with the cards' words and the alignment can time them.
export function parseCards(text: string) {
	const cards: Card[] = []
	for (const token of text.trim().split(/\s+/)) {
		const last = cards.at(-1)
		if (EMOJI_TOKEN.test(token) && last) {
			last.emoji = token
			continue
		}
		cards.push({
			words: token.split('_').map(word => ({ accent: word.includes('*'), text: word.replaceAll('*', '') })),
		})
	}
	return cards
}

export function spokenText(text: string) {
	return parseCards(text)
		.flatMap(card => card.words.map(word => word.text))
		.join(' ')
}

// Reference edit: a card shows from its word until the next one, never longer
// than a beat; the last one holds a moment after the voice stops.
const CARD_MAX_FRAMES = 36
const LAST_CARD_HOLD_FRAMES = 12

/** Frame ranges relative to the clip start, one per card. Word count must match. */
export function cardTimings(cards: readonly Card[], words: readonly WordTiming[]) {
	const wordCount = cards.reduce((sum, card) => sum + card.words.length, 0)
	if (wordCount !== words.length) {
		throw new Error(`${wordCount} card words but ${words.length} timed words; regenerate the clip`)
	}
	let wordIndex = 0
	const starts = cards.map(card => {
		const start = Math.round(words[wordIndex].start * FPS)
		wordIndex += card.words.length
		return start
	})
	const lastEnd = Math.round((words.at(-1)?.end ?? 0) * FPS) + LAST_CARD_HOLD_FRAMES

	return starts.map((from, index) => ({
		from,
		to: Math.min(from + CARD_MAX_FRAMES, starts[index + 1] ?? lastEnd),
	}))
}

export interface Brand {
	name: string
	url: string
	mark?: ComponentType<{ size?: number }>
	tags: readonly string[]
	facts: readonly string[]
	never: readonly string[]
	voice: { id: string; model: string }
	/** Channel id from studio.youtube.com/channel/<id>; `publish.sh youtube` opens its upload dialog. */
	youtubeChannel?: string
}

const CAPTION_MAX_CHARS = 24
const MIN_CHUNK_FRAMES = 10

// Words grouped into short lines, with a hard break after sentence-ending
// punctuation so beats like "No prompts." get their own card.
function chunkCaption(text: string) {
	const chunks: string[] = []
	let current = ''

	for (const word of text.split(' ')) {
		const joined = current ? `${current} ${word}` : word
		if (joined.length > CAPTION_MAX_CHARS && current) {
			chunks.push(current)
			current = word
		} else {
			current = joined
		}
		if (/[.?!]$/.test(current)) {
			chunks.push(current)
			current = ''
		}
	}
	if (current) {
		chunks.push(current)
	}

	return chunks
}

/** A caption chunk timed off the voice: every word carries the frame it is spoken on. */
export interface TimedChunk {
	from: number
	to: number
	words: { at: number; text: string }[]
}

// Same chunks, timed by ElevenLabs word timestamps (`vo/<clip>.json`, written by
// scripts/vo.ts for every clip). `say` must keep `text`'s word count so the
// n-th spoken word is the n-th caption word; vo.ts enforces that.
export function timedCaptionChunks(text: string, words: readonly WordTiming[], maxFrames = Infinity): TimedChunk[] {
	const textWords = text.split(' ')
	const last = words.at(-1)
	if (!last || textWords.length !== words.length) {
		throw new Error(`${textWords.length} caption words but ${words.length} timed words in "${text}"`)
	}
	const lastEnd = Math.min(maxFrames, Math.round(last.end * FPS) + LAST_CARD_HOLD_FRAMES)
	let index = 0
	const chunks = chunkCaption(text).map(chunk => ({
		words: chunk.split(' ').map(word => ({ at: Math.round(words[index++].start * FPS), text: word })),
	}))

	return chunks.map((chunk, i) => ({
		...chunk,
		from: chunk.words[0].at,
		to: chunks[i + 1]?.words[0].at ?? lastEnd,
	}))
}

// Chunk timing from the text alone at the video's measured rate: the fallback
// for clips voiced before word timings were kept. Frames are relative to the
// clip's own start. `maxFrames` is the gap to the next clip: a rate averaged
// over five lines runs long on the fast ones, and the last chunk must not sit
// on screen under the next line's first.
export function captionChunks(text: string, charsPerSecond: number, maxFrames = Infinity) {
	let from = 0

	return chunkCaption(text)
		.map(chunk => {
			const to = Math.min(
				maxFrames,
				from + Math.max(MIN_CHUNK_FRAMES, Math.round((chunk.length / charsPerSecond) * FPS)),
			)
			const chunkFrom = from
			from = to

			return { from: chunkFrom, text: chunk, to }
		})
		.filter(chunk => chunk.to > chunk.from)
}
