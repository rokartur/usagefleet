import type { CSSProperties } from 'react'
import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import {
	Camera,
	COLORS,
	countTo,
	EndScene,
	firstSceneOpacity,
	GameplayStrip,
	Hero,
	Impact,
	KineticTitle,
	Meter,
	Pill,
	pop,
	progress,
	ProgressBar,
	sceneOpacity,
	shake,
	Sound,
	VideoCanvas,
	VoiceOver,
} from './CampaignKit'

// Top 90 px clears TikTok's status bar, bottom 640 px clears the gameplay
// strip (y 1360) and the captions above it.
const SCENE_PADDING = '90px 72px 640px'

const PEOPLE = [
	{ color: COLORS.indigo, name: 'You', value: 61 },
	{ color: COLORS.emerald, name: 'Friend', value: 39 },
]

const DIGITS: CSSProperties = {
	fontVariantNumeric: 'tabular-nums',
	fontWeight: 760,
	letterSpacing: '-0.07em',
	lineHeight: 1,
}

function HookScene() {
	const frame = useCurrentFrame()
	const kick = shake(frame, 8, 12)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, 90, 8),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<Pill style={{ marginBottom: 40, width: 'fit-content' }}>Claude Max</Pill>
			<Hero color={COLORS.amber}>20x</Hero>
			<KineticTitle delay={14} lines={['One sub.', 'Two people.']} size={92} style={{ marginTop: 36 }} />
		</AbsoluteFill>
	)
}

// $200 ticks down to $100 as the split lands; the shake marks the landing.
function PriceScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()
	const price = 200 - countTo(frame, 100, 18, 16)
	const kick = shake(frame, 34, 10)
	const landed = frame >= 34

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<Pill style={{ marginBottom: 40, width: 'fit-content' }}>$200 split in two</Pill>
			<Hero color={landed ? COLORS.emerald : COLORS.text} delay={4}>
				{`$${price}`}
			</Hero>
			<KineticTitle delay={34} lines={['each.']} size={92} style={{ marginTop: 36 }} />
		</AbsoluteFill>
	)
}

// 20x tears into two 10x tiles that fly apart; the 5x row is what you would
// have paid the same money for.
function PlanScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()
	const spread = pop(frame, 16, 120)
	const kick = shake(frame, 16, 10)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<div style={{ display: 'flex', gap: 24 }}>
				{PEOPLE.map((person, index) => (
					<div
						key={person.name}
						style={{
							...DIGITS,
							color: person.color,
							flex: 1,
							fontSize: 220,
							opacity: progress(frame, 2, 6),
							textAlign: 'center',
							transform: `translate3d(${(index === 0 ? 1 : -1) * (1 - spread) * 230}px, 0, 0) scale(${0.6 + spread * 0.4})`,
						}}
					>
						10x
					</div>
				))}
			</div>
			<KineticTitle
				accentColor={COLORS.amber}
				accentWords={['5x']}
				delay={30}
				lines={['each, at the', '5x price.']}
				size={92}
				style={{ marginTop: 36 }}
			/>
		</AbsoluteFill>
	)
}

function WhoSpentScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()

	return (
		<AbsoluteFill
			style={{ justifyContent: 'center', opacity: sceneOpacity(frame, duration), padding: SCENE_PADDING }}
		>
			<Pill style={{ marginBottom: 40, width: 'fit-content' }}>Weekly · live</Pill>
			<div style={{ display: 'grid', gap: 52 }}>
				{PEOPLE.map((person, index) => {
					const delay = 4 + index * 14
					const p = pop(frame, delay)
					return (
						<div
							key={person.name}
							style={{
								opacity: Math.min(1, p * 1.6),
								transform: `translate3d(${(1 - p) * 120}px, 0, 0)`,
							}}
						>
							<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
								<span
									style={{
										color: COLORS.text,
										fontSize: 72,
										fontWeight: 640,
										letterSpacing: '-0.03em',
									}}
								>
									{person.name}
								</span>
								<span style={{ ...DIGITS, color: person.color, fontSize: 150 }}>
									{countTo(frame, person.value, delay, 30)}%
								</span>
							</div>
							<div style={{ marginTop: 18 }}>
								<Meter
									color={person.color}
									delay={delay}
									frame={frame}
									glow
									height={22}
									value={person.value}
								/>
							</div>
						</div>
					)
				})}
			</div>
		</AbsoluteFill>
	)
}

// The two meters from the previous scene fuse into one full bar: one sub,
// two slices.
function SplitEndScene() {
	const frame = useCurrentFrame()
	const fuse = pop(frame, 4, 110)

	return (
		<EndScene>
			<div style={{ display: 'flex', gap: (1 - fuse) * 40 + 6, marginTop: 64, width: '100%' }}>
				{PEOPLE.map(person => (
					<div
						key={person.name}
						style={{
							background: person.color,
							borderRadius: 999,
							boxShadow: `0 0 ${fuse * 40}px ${person.color}88`,
							height: 26,
							transform: `scaleY(${0.4 + fuse * 0.6})`,
							width: `${person.value}%`,
						}}
					/>
				))}
			</div>
			<KineticTitle delay={12} lines={['One sub. Two slices.']} size={64} style={{ marginTop: 40 }} />
		</EndScene>
	)
}

export function SplitTheMax() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={90}>
				<Camera duration={90}>
					<HookScene />
				</Camera>
			</Sequence>
			<Sequence from={82} durationInFrames={94}>
				<Camera duration={94}>
					<PriceScene duration={94} />
				</Camera>
			</Sequence>
			<Sequence from={168} durationInFrames={96}>
				<Camera duration={96}>
					<PlanScene duration={96} />
				</Camera>
			</Sequence>
			<Sequence from={256} durationInFrames={100}>
				<Camera duration={100}>
					<WhoSpentScene duration={100} />
				</Camera>
			</Sequence>
			<Sequence from={348} durationInFrames={102}>
				<Camera duration={102}>
					<SplitEndScene />
				</Camera>
			</Sequence>

			<VoiceOver video='SplitTheMax' />

			<Impact at={8} color='rgba(245,158,11,0.28)' />
			<Impact at={116} color='rgba(16,185,129,0.22)' />
			<Impact at={184} />
			<ProgressBar />

			<Sound src='sfx/music.wav' volume={0.32} />
			<Sound at={8} src='sfx/hit.wav' volume={1} />
			<Sound at={82} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={86} src='sfx/pop.wav' volume={0.4} />
			<Sound at={116} src='sfx/pop.wav' volume={0.5} />
			<Sound at={168} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={184} src='sfx/pop.wav' volume={0.5} />
			<Sound at={256} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={260} src='sfx/pop.wav' volume={0.4} />
			<Sound at={274} src='sfx/pop.wav' volume={0.4} />
			<Sound at={348} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={370} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-9.mp4' />
		</VideoCanvas>
	)
}
