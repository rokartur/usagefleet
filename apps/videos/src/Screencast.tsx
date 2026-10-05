// Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
//
// Screencast format, after the CapCut reference edit: a screen recording cut
// into zoom shots that follow the cursor, one caption card per spoken word
// timed by ElevenLabs word timestamps, emoji stickers, a whoosh on every cut.
// Data only: a video in this format is a CAMPAIGN entry with `screen`, no TSX.
// Panel.tsx reuses the captions and the word-timing fetch over a React tree.
import { useEffect, useState } from 'react'
import {
	AbsoluteFill,
	Audio,
	cancelRender,
	continueRender,
	delayRender,
	interpolate,
	OffthreadVideo,
	Sequence,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion'
import { COLORS, EASE_OUT, FONT, Sound } from './CampaignKit'
import type { Card, ScreenVideo, Shot, WordTiming } from './kit'
import { cardTimings, parseCards, wordTimingsSrc } from './kit'

const WIDTH = 1080
const HEIGHT = 1920
const ACCENTS = [COLORS.emerald, COLORS.amber, COLORS.indigo, COLORS.red]
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

export function Screencast({ video }: { video: ScreenVideo }) {
	const { durationInFrames } = useVideoConfig()
	const [clip] = video.clips
	const words = useWordTimings(clip.src)
	if (!words) {
		return null
	}
	const cards = parseCards(clip.text)
	const timings = cardTimings(cards, words)
	const { shots, src } = video.screen

	return (
		<AbsoluteFill style={{ background: COLORS.background, fontFamily: FONT }}>
			{shots.map((shot, index) => (
				<Sequence
					key={shot.at}
					from={shot.at}
					durationInFrames={(shots[index + 1]?.at ?? durationInFrames) - shot.at}
				>
					<ShotView shot={shot} src={src} />
				</Sequence>
			))}
			{cards.map((card, index) => {
				const { from, to } = timings[index]
				const at = clip.at + from
				// The shot on screen at the card's first frame; the card follows its anchor.
				const shot = shots.find((_, i) => (shots[i + 1]?.at ?? Infinity) > at) ?? shots[0]
				return (
					<Sequence key={at} from={at} durationInFrames={to - from}>
						<CaptionCard card={card} index={index} y={shot.captionY ?? 0.42} />
						{card.emoji && <Sound src='sfx/pop.wav' volume={0.4} />}
					</Sequence>
				)
			})}
			<Sequence from={clip.at}>
				<Audio src={staticFile(clip.src)} />
			</Sequence>
			<Sound src='sfx/drive.wav' volume={0.25} />
			{shots.slice(1).map(shot => (
				<Sound key={shot.at} at={shot.at} src='sfx/whoosh.wav' volume={0.5} />
			))}
		</AbsoluteFill>
	)
}

export function useWordTimings(clipSrc: string) {
	const [words, setWords] = useState<WordTiming[]>()
	const [handle] = useState(() => delayRender(`word timings for ${clipSrc}`))
	useEffect(() => {
		fetch(staticFile(wordTimingsSrc(clipSrc)))
			.then(res => res.json())
			.then((json: WordTiming[]) => {
				setWords(json)
				continueRender(handle)
			})
			.catch(cancelRender)
	}, [clipSrc, handle])
	return words
}

// The focus point lands on frame centre; translation is clamped so the
// recording always covers the frame. A cut lands 6% short of its scale and
// settles in 6 frames, which reads as a punch rather than a fade.
function ShotView({ shot, src }: { shot: Shot; src: string }) {
	const frame = useCurrentFrame()
	const scale = Math.max(1, shot.scale * interpolate(frame, [0, 6], [0.94, 1], { ...clamp, easing: EASE_OUT }))
	const tx = Math.min(0, Math.max(WIDTH - WIDTH * scale, WIDTH / 2 - shot.x * WIDTH * scale))
	const ty = Math.min(0, Math.max(HEIGHT - HEIGHT * scale, HEIGHT / 2 - shot.y * HEIGHT * scale))

	return (
		<AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0' }}>
			<OffthreadVideo
				muted
				src={staticFile(src)}
				startFrom={shot.from ?? shot.at}
				style={{ height: '100%', objectFit: 'cover', width: '100%' }}
			/>
		</AbsoluteFill>
	)
}

// Deterministic per-letter offsets: the same card scatters the same way on every render.
function noise(seed: number) {
	const value = Math.sin(seed * 12.9898) * 43_758.5453
	return value - Math.floor(value)
}

export function CaptionCard({ card, index, y }: { card: Card; index: number; y: number }) {
	const frame = useCurrentFrame()
	const { fps, height, width } = useVideoConfig()
	// Sizes below are for the 1080-wide frame; a panel take composes at half that
	// and renders at scale 2, so everything scales with the composition width.
	const k = width / WIDTH
	const pop = spring({ config: { damping: 12, stiffness: 220 }, fps, frame })
	const stickerSide = index % 2 ? 'left' : 'right'
	// Inter Black runs ~0.65em per glyph, so a URL-length word overflows the 936px
	// column at 136px; shrink the whole card to its longest word.
	const longest = Math.max(...card.words.map(word => word.text.length))
	const fontSize = Math.min(136, Math.floor(1400 / longest)) * k
	let letter = 0

	return (
		<div
			style={{
				left: 72 * k,
				position: 'absolute',
				right: 72 * k,
				textAlign: 'center',
				top: y * height,
				transform: `translateY(-50%) scale(${0.85 + 0.15 * pop})`,
			}}
		>
			{/* The UI under a card stays legible-ish but the word wins: a soft dark
			    blur hugging the text, sized by the words themselves. */}
			<div
				style={{
					backdropFilter: `blur(${18 * k}px)`,
					background: 'rgba(0,0,0,0.45)',
					borderRadius: 28 * k,
					display: 'inline-block',
					opacity: pop,
					padding: `${10 * k}px ${44 * k}px`,
					position: 'relative',
				}}
			>
				{card.words.map(word => (
					<div
						key={word.text}
						style={{
							color: word.accent ? ACCENTS[index % ACCENTS.length] : COLORS.text,
							fontSize,
							fontWeight: 900,
							letterSpacing: '-0.03em',
							lineHeight: 1.05,
							textShadow: '0 4px 0 #000, 0 0 18px rgba(0,0,0,0.95), 0 10px 30px rgba(0,0,0,0.8)',
							whiteSpace: 'nowrap',
						}}
					>
						{[...word.text].map((char, charIndex) => {
							const seed = letter++
							// Letters fly in from scattered offsets, staggered half a frame each.
							const settle = interpolate(frame, [seed * 0.5, seed * 0.5 + 6], [0, 1], {
								...clamp,
								easing: EASE_OUT,
							})
							const dx = (noise(seed) - 0.5) * 140 * k * (1 - settle)
							const dy = (noise(seed + 7) - 0.5) * 90 * k * (1 - settle)
							return (
								<span
									key={`${charIndex}${char}`}
									style={{
										display: 'inline-block',
										opacity: settle,
										transform: `translate(${dx}px, ${dy}px)`,
									}}
								>
									{char}
								</span>
							)
						})}
					</div>
				))}
			</div>
			{card.emoji && (
				<div
					style={{
						[stickerSide]: 20 * k,
						fontSize: 170 * k,
						lineHeight: 1,
						position: 'absolute',
						top: -200 * k,
						transform: `scale(${pop}) rotate(${(1 - pop) * 25 * (stickerSide === 'left' ? -1 : 1)}deg)`,
					}}
				>
					{card.emoji}
				</div>
			)}
		</div>
	)
}
