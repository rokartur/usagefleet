import type { CSSProperties, ReactNode } from 'react'
import {
	AbsoluteFill,
	Audio,
	Easing,
	interpolate,
	OffthreadVideo,
	Sequence,
	spring,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion'

export const COLORS = {
	amber: '#f59e0b',
	background: '#000000',
	border: 'rgba(255,255,255,0.12)',
	emerald: '#10b981',
	indigo: '#6366f1',
	muted: 'rgba(255,255,255,0.56)',
	red: '#ff5b57',
	text: '#f8f8f8',
	violet: '#a78bfa',
}

export const FONT = "'Inter Variable', Inter, system-ui, sans-serif"
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
export const EASE_IN_OUT = Easing.bezier(0.77, 0, 0.175, 1)

export const clamp = {
	extrapolateLeft: 'clamp',
	extrapolateRight: 'clamp',
} as const

export function progress(frame: number, start: number, duration: number, easing = EASE_OUT) {
	return interpolate(frame, [start, start + duration], [0, 1], { ...clamp, easing })
}

export function sceneOpacity(frame: number, duration: number, fade = 14) {
	return interpolate(frame, [0, fade, duration - fade, duration], [0, 1, 1, 0], clamp)
}

export function firstSceneOpacity(frame: number, duration: number, fade = 14) {
	return interpolate(frame, [duration - fade, duration], [1, 0], clamp)
}

export function rise(frame: number, start = 0, distance = 42) {
	const p = progress(frame, start, 18)
	return {
		opacity: p,
		transform: `translate3d(0, ${distance * (1 - p)}px, 0)`,
	}
}

export function countTo(frame: number, value: number, start = 0, duration = 26) {
	return Math.round(value * progress(frame, start, duration, EASE_IN_OUT))
}

// Spring with overshoot for entrances — cards land with weight instead of fading in.
export function pop(frame: number, delay = 0, stiffness = 150) {
	return spring({ config: { damping: 13, mass: 0.8, stiffness }, fps: 30, frame: frame - delay })
}

// Entrance transform + clamped opacity from a single spring value.
export function popIn(frame: number, delay = 0, distance = 36) {
	const p = pop(frame, delay)
	return {
		opacity: Math.min(1, p * 1.6),
		transform: `translate3d(0, ${(1 - p) * distance}px, 0) scale(${0.94 + p * 0.06})`,
	}
}

// Deterministic decaying shake for impact moments.
export function shake(frame: number, at: number, amp = 9, len = 14) {
	const t = frame - at
	if (t < 0 || t > len) return { x: 0, y: 0 }
	const decay = 1 - t / len
	return { x: Math.sin(t * 2.6) * amp * decay, y: Math.cos(t * 3.4) * amp * 0.55 * decay }
}

// Full-canvas radial flash — pairs with sfx/hit and heavy sfx/pop moments.
// Mount at composition level (absolute frames), before GameplayStrip.
export function Impact({ at, color = 'rgba(255,255,255,0.2)' }: { at: number; color?: string }) {
	const frame = useCurrentFrame()
	const opacity = interpolate(frame, [at, at + 2, at + 12], [0, 1, 0], clamp)

	if (opacity === 0) return null
	return (
		<AbsoluteFill
			style={{
				background: `radial-gradient(ellipse 90% 55% at 50% 38%, ${color}, transparent 70%)`,
				opacity,
				pointerEvents: 'none',
			}}
		/>
	)
}

// Word-by-word kinetic headline: each word springs in with a blur-settle.
export function KineticTitle({
	accentColor,
	accentWords = [],
	delay = 0,
	lines,
	size = 84,
	stagger = 3,
	style,
}: {
	accentColor?: string
	accentWords?: string[]
	delay?: number
	lines: string[]
	size?: number
	stagger?: number
	style?: CSSProperties
}) {
	const frame = useCurrentFrame()
	let wordIndex = 0

	return (
		<div
			style={{
				fontSize: size,
				fontWeight: 680,
				letterSpacing: '-0.056em',
				lineHeight: 1.02,
				...style,
			}}
		>
			{lines.map(line => (
				<div key={line}>
					{line.split(' ').map(word => {
						const p = pop(frame, delay + wordIndex++ * stagger, 170)
						const blur = Math.max(0, (1 - p) * 12)
						return (
							<span
								key={word}
								style={{
									color: accentWords.includes(word) ? accentColor : undefined,
									display: 'inline-block',
									filter: blur > 0.5 ? `blur(${blur}px)` : undefined,
									marginRight: '0.24em',
									opacity: Math.min(1, p * 1.7),
									transform: `translate3d(0, ${(1 - p) * 40}px, 0) scale(${0.92 + p * 0.08})`,
								}}
							>
								{word}
							</span>
						)
					})}
				</div>
			))}
		</div>
	)
}

// Thin retention line across the top — signals "this is short, stay".
export function ProgressBar() {
	const frame = useCurrentFrame()
	const { durationInFrames } = useVideoConfig()

	return (
		<div style={{ background: 'rgba(255,255,255,0.14)', height: 5, left: 0, position: 'absolute', right: 0, top: 0 }}>
			<div
				style={{
					background: COLORS.text,
					height: '100%',
					transform: `scaleX(${frame / durationInFrames})`,
					transformOrigin: 'left',
				}}
			/>
		</div>
	)
}

// True-black canvas matching the app: faint drifting grid only, no glows.
function CampaignBackground() {
	const frame = useCurrentFrame()
	const drift = interpolate(frame, [0, 900], [-80, 110], clamp)

	return (
		<AbsoluteFill style={{ background: COLORS.background, overflow: 'hidden' }}>
			<div
				style={{
					backgroundImage:
						'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
					backgroundPosition: `0 ${drift}px`,
					backgroundSize: '96px 96px',
					inset: 0,
					maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 76%, transparent)',
					opacity: 0.3,
					position: 'absolute',
				}}
			/>
		</AbsoluteFill>
	)
}

export function VideoCanvas({ children }: { children: ReactNode }) {
	return (
		<AbsoluteFill
			style={{
				WebkitFontSmoothing: 'antialiased',
				background: COLORS.background,
				color: COLORS.text,
				fontFamily: FONT,
			}}
		>
			<CampaignBackground />
			{children}
		</AbsoluteFill>
	)
}

// Muted gameplay pinned under the content area — the classic TikTok retention
// strip. Clips live in public/gameplay/, pre-cropped to 1080×560.
export function GameplayStrip({ src }: { src: string }) {
	return (
		<div style={{ borderTop: `1px solid ${COLORS.border}`, bottom: 0, height: 560, left: 0, position: 'absolute', right: 0 }}>
			<OffthreadVideo muted src={staticFile(src)} style={{ height: '100%', objectFit: 'cover', width: '100%' }} />
		</div>
	)
}

// Scene-level punch-in: fast settle from 1.08, slow zoom drift, then a kick
// outward in the last frames so every cut reads as a whip. Wrap a scene's
// content, not the canvas, so the grid stays put.
export function Camera({ children, duration }: { children: ReactNode; duration: number }) {
	const frame = useCurrentFrame()
	const punch = progress(frame, 0, 10)
	const exit = progress(frame, duration - 10, 10)
	const scale = (1.08 - punch * 0.08) * interpolate(frame, [0, duration], [1, 1.04], clamp) * (1 + exit * 0.05)

	return (
		<AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: '50% 44%' }}>{children}</AbsoluteFill>
	)
}

export function Sound({ at = 0, src, volume = 1 }: { at?: number; src: string; volume?: number }) {
	return (
		<Sequence from={at}>
			<Audio src={staticFile(src)} volume={volume} />
		</Sequence>
	)
}

export function UsageFleetMark({ size = 48 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox='0 0 32 32' aria-hidden>
			<path fill='currentColor' d='M3 4h8l9 9h9v6h-9l-9 9H3v-6h5.5l6-6-6-6H3V4Zm0 9h13v6H3v-6Z' />
		</svg>
	)
}

export function Pill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
	return (
		<div
			style={{
				alignItems: 'center',
				background: 'rgba(255,255,255,0.07)',
				border: `1px solid ${COLORS.border}`,
				borderRadius: 999,
				color: COLORS.muted,
				display: 'flex',
				fontSize: 23,
				fontWeight: 650,
				gap: 12,
				letterSpacing: '0.08em',
				padding: '13px 21px',
				textTransform: 'uppercase',
				...style,
			}}
		>
			{children}
		</div>
	)
}

export function Surface({ children, color, style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
	return (
		<div
			style={{
				background: 'rgba(255,255,255,0.045)',
				border: `1px solid ${color ? `${color}55` : COLORS.border}`,
				borderRadius: 30,
				...style,
			}}
		>
			{children}
		</div>
	)
}

export function DeviceIcon({ kind, size = 48 }: { kind: 'desktop' | 'laptop' | 'server'; size?: number }) {
	if (kind === 'laptop') {
		return (
			<svg viewBox='0 0 48 48' width={size} height={size} fill='none' aria-hidden>
				<rect x='8' y='8' width='32' height='24' rx='4' stroke='currentColor' strokeWidth='2.5' />
				<path d='M4 37h40l-3 4H7l-3-4Z' fill='currentColor' />
			</svg>
		)
	}

	if (kind === 'desktop') {
		return (
			<svg viewBox='0 0 48 48' width={size} height={size} fill='none' aria-hidden>
				<rect x='6' y='6' width='36' height='27' rx='4' stroke='currentColor' strokeWidth='2.5' />
				<path d='M18 41h12M24 33v8' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' />
			</svg>
		)
	}

	return (
		<svg viewBox='0 0 48 48' width={size} height={size} fill='none' aria-hidden>
			<rect x='10' y='5' width='28' height='38' rx='5' stroke='currentColor' strokeWidth='2.5' />
			<path d='M15 15h18M15 24h18M15 33h18' stroke='currentColor' strokeWidth='2.5' />
			<circle cx='31' cy='10' r='2' fill='currentColor' />
		</svg>
	)
}

export function Meter({
	color = COLORS.text,
	delay = 0,
	frame,
	glow = false,
	height = 12,
	value,
}: {
	color?: string
	delay?: number
	frame: number
	glow?: boolean
	height?: number
	value: number
}) {
	const p = progress(frame, delay, 24, EASE_IN_OUT)

	return (
		<div
			style={{
				background: 'rgba(255,255,255,0.1)',
				borderRadius: 999,
				height,
				overflow: glow ? undefined : 'hidden',
			}}
		>
			<div
				style={{
					background: color,
					borderRadius: 999,
					boxShadow: glow ? `0 0 22px ${color}77` : undefined,
					height: '100%',
					transform: `scaleX(${(Math.max(0, Math.min(100, value)) / 100) * p})`,
					transformOrigin: 'left',
				}}
			/>
		</div>
	)
}

export function WindowCard({
	color = COLORS.text,
	delay = 0,
	frame,
	label,
	reset,
	value,
}: {
	color?: string
	delay?: number
	frame: number
	label: string
	reset: string
	value: number
}) {
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			style={{
				opacity: appear,
				padding: '28px 30px',
				transform: `translate3d(0, ${(1 - appear) * 32}px, 0)`,
			}}
		>
			<div style={{ color: COLORS.muted, fontSize: 22 }}>{label}</div>
			<div
				style={{
					color,
					fontSize: 82,
					fontVariantNumeric: 'tabular-nums',
					fontWeight: 650,
					letterSpacing: '-0.06em',
					lineHeight: 1,
					marginTop: 12,
				}}
			>
				{countTo(frame, value, delay + 4, 28)}%
			</div>
			<div style={{ marginTop: 22 }}>
				<Meter color={color} delay={delay + 4} frame={frame} value={value} />
			</div>
			<div style={{ color: COLORS.muted, fontSize: 19, marginTop: 15 }}>{reset}</div>
		</Surface>
	)
}

export function DeviceRow({
	color,
	delay = 0,
	frame,
	kind,
	label,
	suffix = '%',
	value,
}: {
	color: string
	delay?: number
	frame: number
	kind: 'desktop' | 'laptop' | 'server'
	label: string
	suffix?: string
	value: number
}) {
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			color={color}
			style={{
				alignItems: 'center',
				display: 'grid',
				gap: 22,
				gridTemplateColumns: '58px 1fr 110px',
				opacity: appear,
				padding: '24px 26px',
				transform: `translate3d(0, ${(1 - appear) * 28}px, 0)`,
			}}
		>
			<div style={{ color }}>
				<DeviceIcon kind={kind} size={44} />
			</div>
			<div>
				<div style={{ color: COLORS.text, fontSize: 27, fontWeight: 590 }}>{label}</div>
				<div style={{ marginTop: 14 }}>
					<Meter color={color} delay={delay + 4} frame={frame} value={value} />
				</div>
			</div>
			<div
				style={{
					color: COLORS.text,
					fontSize: 42,
					fontVariantNumeric: 'tabular-nums',
					fontWeight: 680,
					letterSpacing: '-0.045em',
					textAlign: 'right',
				}}
			>
				{countTo(frame, value, delay + 4, 24)}
				{suffix}
			</div>
		</Surface>
	)
}

export function TerminalCard({
	color,
	delay = 0,
	frame,
	lines,
	name,
}: {
	color: string
	delay?: number
	frame: number
	lines: string[]
	name: string
}) {
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			color={color}
			style={{
				opacity: appear,
				overflow: 'hidden',
				transform: `translate3d(0, ${(1 - appear) * 34}px, 0)`,
			}}
		>
			<div
				style={{
					alignItems: 'center',
					borderBottom: `1px solid ${COLORS.border}`,
					display: 'flex',
					gap: 10,
					padding: '16px 20px',
				}}
			>
				<span style={{ background: '#ff5f57', borderRadius: 999, height: 10, width: 10 }} />
				<span style={{ background: '#febc2e', borderRadius: 999, height: 10, width: 10 }} />
				<span style={{ background: '#28c840', borderRadius: 999, height: 10, width: 10 }} />
				<span style={{ color: COLORS.muted, fontSize: 19, marginLeft: 8 }}>{name}</span>
			</div>
			<div
				style={{
					color: 'rgba(255,255,255,0.76)',
					fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
					fontSize: 21,
					lineHeight: 1.65,
					minHeight: 120,
					padding: '20px 22px 24px',
				}}
			>
				{lines.map((line, index) => {
					const lineAppear = progress(frame, delay + 7 + index * 4, 10)
					return (
						<div key={line} style={{ opacity: lineAppear }}>
							<span style={{ color }}>$</span> {line}
						</div>
					)
				})}
			</div>
		</Surface>
	)
}

export function CheckRow({ children, delay, frame }: { children: ReactNode; delay: number; frame: number }) {
	const appear = progress(frame, delay, 16)

	return (
		<div
			style={{
				alignItems: 'center',
				background: 'rgba(255,255,255,0.055)',
				border: `1px solid ${COLORS.border}`,
				borderRadius: 24,
				display: 'flex',
				gap: 20,
				opacity: appear,
				padding: '23px 26px',
				transform: `translate3d(${(1 - appear) * 38}px, 0, 0)`,
			}}
		>
			<div
				style={{
					alignItems: 'center',
					background: 'rgba(16,185,129,0.15)',
					border: '1px solid rgba(16,185,129,0.38)',
					borderRadius: 999,
					color: COLORS.emerald,
					display: 'flex',
					fontSize: 23,
					fontWeight: 780,
					height: 46,
					justifyContent: 'center',
					width: 46,
				}}
			>
				✓
			</div>
			<div style={{ color: COLORS.text, fontSize: 33, fontWeight: 590 }}>{children}</div>
		</div>
	)
}

export function EndCard({ kicker, question, title }: { kicker?: string; question?: string; title: ReactNode }) {
	const frame = useCurrentFrame()
	const mark = pop(frame, 0)
	const copy = pop(frame, 8)
	const url = pop(frame, 20)
	// One heartbeat on the URL pill when the ding lands (~scene frame 22).
	const pulse = 1 + Math.sin(Math.min(Math.PI, Math.max(0, (frame - 24) / 10) * Math.PI)) * 0.06

	return (
		<AbsoluteFill
			style={{
				alignItems: 'center',
				justifyContent: 'flex-start',
				opacity: 1,
				padding: '140px 72px 640px',
				textAlign: 'center',
			}}
		>
			<div
				style={{
					alignItems: 'center',
					display: 'flex',
					flexDirection: 'column',
					opacity: Math.min(1, mark * 1.5),
					transform: `translate3d(0, ${(1 - mark) * 34}px, 0) scale(${0.93 + mark * 0.07})`,
				}}
			>
				<UsageFleetMark size={104} />
				<div style={{ fontSize: 82, fontWeight: 700, letterSpacing: '-0.06em', marginTop: 28 }}>UsageFleet</div>
			</div>

			<div
				style={{
					fontSize: 70,
					fontWeight: 640,
					letterSpacing: '-0.052em',
					lineHeight: 1.04,
					marginTop: 130,
					maxWidth: 900,
					opacity: Math.min(1, copy * 1.5),
					textWrap: 'balance',
					transform: `translate3d(0, ${(1 - copy) * 32}px, 0)`,
				}}
			>
				{title}
			</div>

			{question ? (
				<div
					style={{
						color: COLORS.muted,
						fontSize: 30,
						lineHeight: 1.4,
						marginTop: 42,
						maxWidth: 820,
						opacity: progress(frame, 16, 18),
						textWrap: 'balance',
					}}
				>
					{question}
				</div>
			) : null}

			<div
				style={{
					background: COLORS.text,
					borderRadius: 999,
					color: '#080808',
					fontSize: 33,
					fontWeight: 700,
					boxShadow: '0 0 46px rgba(255,255,255,0.22)',
					marginTop: 82,
					opacity: Math.min(1, url * 1.5),
					padding: '23px 42px',
					transform: `translate3d(0, ${(1 - url) * 26}px, 0) scale(${(0.9 + url * 0.1) * pulse})`,
				}}
			>
				usagefleet.com
			</div>

			{kicker ? (
				<div
					style={{
						// Sits just above the gameplay strip (strip top = y 1360).
						bottom: 600,
						color: COLORS.muted,
						fontSize: 22,
						left: 72,
						letterSpacing: '0.08em',
						opacity: progress(frame, 30, 18),
						position: 'absolute',
						right: 72,
						textTransform: 'uppercase',
					}}
				>
					{kicker}
				</div>
			) : null}
		</AbsoluteFill>
	)
}
