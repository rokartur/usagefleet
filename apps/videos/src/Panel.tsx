// Kit file, copied from the tiktok skill template. Fix things there, then re-copy.
//
// Panel format: the screencast edit (zoom cuts, per-word captions, whoosh on
// every cut) over the product's own React components instead of a recording,
// with a simulated cursor that glides between the shots' targets. The
// workspace's Root passes the product tree as children; the campaign entry
// says where the cursor stops. Deterministic and crisp at any scale, and the
// UI can never be someone's real account.
import type { ReactNode } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import {
	AbsoluteFill,
	Audio,
	cancelRender,
	continueRender,
	delayRender,
	Easing,
	interpolate,
	Sequence,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion'
import { COLORS, EASE_OUT, Sound } from './CampaignKit'
import type { PanelShot, PanelVideo } from './kit'
import { cardTimings, parseCards } from './kit'
import { CaptionCard, useWordTimings } from './Screencast'

const CURSOR_GLIDE_FRAMES = 18
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

interface Point {
	x: number
	y: number
}

/** The panel's natural height and one target point per shot, in panel pixels. */
interface Layout {
	height: number
	points: Point[]
}

export function Panel({ children, video }: { children: ReactNode; video: PanelVideo }) {
	const [clip] = video.clips
	const words = useWordTimings(clip.src)
	const { shots } = video.panel
	const { layout, panelRef } = useLayout(shots)
	// The panel mounts before the word timings arrive so its layout can be measured meanwhile.
	const cards = words ? parseCards(clip.text) : []
	const timings = words ? cardTimings(cards, words) : []

	return (
		<AbsoluteFill style={{ background: COLORS.background }}>
			<Camera layout={layout} shots={shots}>
				<div ref={panelRef} style={{ position: 'relative' }}>
					{children}
					{layout && <Cursor points={layout.points} shots={shots} />}
				</div>
			</Camera>
			{cards.map((card, index) => {
				const { from, to } = timings[index]
				const at = clip.at + from
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
			{shots
				.filter(shot => shot.click)
				.map(shot => (
					<Sound key={shot.at} at={shot.at + CURSOR_GLIDE_FRAMES} src='sfx/pop.wav' volume={0.3} />
				))}
		</AbsoluteFill>
	)
}

/** Where the cursor stops: the middle of the text that reads exactly `text`,
 *  `nth` between repeats. Measured as a text range, so a full-width label still
 *  puts the cursor on its letters, not in the empty space beside them. */
function findTarget(root: HTMLElement, { nth = 0, text }: PanelShot) {
	const matches = [...root.querySelectorAll<HTMLElement>('*')].filter(
		el =>
			el.textContent?.trim() === text &&
			el.getClientRects().length > 0 &&
			![...el.children].some(child => child.textContent?.trim() === text),
	)
	const el = matches[nth]
	if (!el) {
		throw new Error(
			`panel target "${text}" #${nth} not found (${matches.length} match${matches.length === 1 ? '' : 'es'})`,
		)
	}
	const range = document.createRange()
	range.selectNodeContents(el)
	return range.getBoundingClientRect()
}

// Targets are measured once the fonts are in, in the panel's own pixels, so
// the camera and cursor read the same layout on every frame and every render
// thread. The render waits on it.
function useLayout(shots: readonly PanelShot[]) {
	const panelRef = useRef<HTMLDivElement>(null)
	const [layout, setLayout] = useState<Layout>()
	const [handle] = useState(() => delayRender('measuring panel targets'))
	useLayoutEffect(() => {
		const root = panelRef.current
		if (!root) {
			return
		}
		document.fonts.ready
			.then(() => {
				const origin = root.getBoundingClientRect()
				setLayout({
					height: origin.height,
					points: shots.map(shot => {
						const box = findTarget(root, shot)
						return { x: box.left + box.width / 2 - origin.left, y: box.top + box.height / 2 - origin.top }
					}),
				})
				continueRender(handle)
			})
			.catch(cancelRender)
	}, [handle, shots])
	return { layout, panelRef }
}

function shotIndexAt(shots: readonly PanelShot[], frame: number) {
	let index = 0
	for (const [i, shot] of shots.entries()) {
		if (shot.at <= frame) {
			index = i
		}
	}
	return index
}

// The target lands on frame centre; translation is clamped so the panel always
// covers the frame. A cut lands 6% short of its scale and settles in 6 frames,
// the same punch as a screencast cut. Until targets are measured the panel
// shows unscaled, which is what gets measured.
function Camera({ children, layout, shots }: { children: ReactNode; layout?: Layout; shots: readonly PanelShot[] }) {
	const frame = useCurrentFrame()
	const { height, width } = useVideoConfig()
	const index = shotIndexAt(shots, frame)
	const shot = shots[index]
	const focus = layout?.points[index]
	if (!layout || !focus) {
		return <AbsoluteFill>{children}</AbsoluteFill>
	}
	const scale = Math.max(
		1,
		shot.scale * interpolate(frame - shot.at, [0, 6], [0.94, 1], { ...clamp, easing: EASE_OUT }),
	)
	const tx = Math.min(0, Math.max(width - width * scale, width / 2 - focus.x * scale))
	const ty = Math.min(0, Math.max(height - layout.height * scale, height / 2 - focus.y * scale))
	return (
		<AbsoluteFill style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})`, transformOrigin: '0 0' }}>
			{children}
		</AbsoluteFill>
	)
}

// A mac arrow, sized in panel pixels so it zooms with the UI. It glides to
// each new target with an ease-out and, on `click` shots, blinks a ring on
// arrival. Nothing in the panel reacts: this is a pointer, not an input.
function Cursor({ points, shots }: { points: Point[]; shots: readonly PanelShot[] }) {
	const frame = useCurrentFrame()
	const { fps } = useVideoConfig()
	const index = shotIndexAt(shots, frame)
	const from = points[Math.max(0, index - 1)]
	const to = points[index]
	const t = interpolate(frame - shots[index].at, [0, CURSOR_GLIDE_FRAMES], [0, 1], {
		...clamp,
		easing: Easing.bezier(0.3, 0, 0.1, 1),
	})
	const x = from.x + (to.x - from.x) * t
	// A gentle arc, like a wrist, not a ruler.
	const y = from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 10
	const clickFrame = shots[index].at + CURSOR_GLIDE_FRAMES
	const ring = shots[index].click
		? spring({ config: { damping: 18, stiffness: 160 }, fps, frame: frame - clickFrame })
		: 0

	return (
		<>
			{ring > 0 && (
				<div
					style={{
						border: '2px solid #fff',
						borderRadius: '50%',
						height: 24,
						left: x - 12,
						opacity: 1 - ring,
						pointerEvents: 'none',
						position: 'absolute',
						top: y - 12,
						transform: `scale(${0.4 + ring * 1.6})`,
						width: 24,
					}}
				/>
			)}
			<svg
				viewBox='0 0 24 24'
				width={20}
				height={20}
				style={{ left: x - 3, pointerEvents: 'none', position: 'absolute', top: y - 2 }}
			>
				<path
					d='M5 3l14 9-6 1 4 7-3 2-4-7-5 4z'
					fill='#fff'
					stroke='#000'
					strokeWidth={1.5}
					strokeLinejoin='round'
				/>
			</svg>
		</>
	)
}
