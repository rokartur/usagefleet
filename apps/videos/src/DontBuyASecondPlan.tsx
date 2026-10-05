import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import {
	Camera,
	COLORS,
	countTo,
	DeviceIcon,
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

const MACHINES = [
	{ color: COLORS.amber, kind: 'desktop', name: 'Desktop', value: 52 },
	{ color: COLORS.indigo, kind: 'laptop', name: 'Laptop', value: 31 },
	{ color: COLORS.emerald, kind: 'server', name: 'Work', value: 17 },
] as const

// $400 lands, then a red line strikes it out: the second plan you were about to buy.
function HookScene() {
	const frame = useCurrentFrame()
	const kick = shake(frame, 6, 12)
	const strike = progress(frame, 26, 12)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, 90, 8),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<Pill style={{ marginBottom: 40, width: 'fit-content' }}>Claude Max × 2</Pill>
			<div style={{ position: 'relative', width: 'fit-content' }}>
				<Hero color={COLORS.amber} delay={6}>
					$400
				</Hero>
				<div
					style={{
						background: COLORS.red,
						borderRadius: 999,
						height: 18,
						left: -14,
						position: 'absolute',
						top: '48%',
						transform: `scaleX(${strike})`,
						transformOrigin: 'left',
						width: 'calc(100% + 28px)',
					}}
				/>
			</div>
			<KineticTitle delay={20} lines={["Don't buy a", 'second plan.']} size={92} style={{ marginTop: 36 }} />
		</AbsoluteFill>
	)
}

// The three machines appear one by one over a single subscription.
function OneSubScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()
	const kick = shake(frame, 14, 10)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<div style={{ display: 'flex', gap: 44, marginBottom: 48 }}>
				{MACHINES.map((machine, index) => {
					const p = pop(frame, 2 + index * 8)
					return (
						<div
							key={machine.name}
							style={{
								color: COLORS.muted,
								opacity: Math.min(1, p * 1.6),
								transform: `translate3d(0, ${(1 - p) * 40}px, 0)`,
							}}
						>
							<DeviceIcon kind={machine.kind} size={92} />
						</div>
					)
				})}
			</div>
			<Hero color={COLORS.emerald} delay={14} size={260}>
				1 sub
			</Hero>
			<KineticTitle delay={26} lines={['covers every', 'machine.']} size={92} style={{ marginTop: 36 }} />
		</AbsoluteFill>
	)
}

// One account-level number, no idea which machine is under it.
function BlindScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()
	const kick = shake(frame, 8, 10)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<Pill style={{ marginBottom: 40, width: 'fit-content' }}>One number for all of them</Pill>
			<Hero color={COLORS.amber} delay={8}>
				??%
			</Hero>
			<KineticTitle delay={24} lines={['Which machine', 'is spending it?']} size={84} style={{ marginTop: 36 }} />
		</AbsoluteFill>
	)
}

// The same number, now attributed: meters slide in per machine.
function SplitScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()

	return (
		<AbsoluteFill
			style={{ justifyContent: 'center', opacity: sceneOpacity(frame, duration), padding: SCENE_PADDING }}
		>
			<Pill style={{ marginBottom: 44, width: 'fit-content' }}>5-hour window · live</Pill>
			<div style={{ display: 'grid', gap: 48 }}>
				{MACHINES.map((machine, index) => {
					const delay = 4 + index * 12
					const p = pop(frame, delay)
					return (
						<div
							key={machine.name}
							style={{
								opacity: Math.min(1, p * 1.6),
								transform: `translate3d(${(1 - p) * 140}px, 0, 0)`,
							}}
						>
							<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
								<span
									style={{
										color: COLORS.text,
										fontSize: 66,
										fontWeight: 640,
										letterSpacing: '-0.03em',
									}}
								>
									{machine.name}
								</span>
								<span
									style={{
										color: machine.color,
										fontSize: 140,
										fontVariantNumeric: 'tabular-nums',
										fontWeight: 760,
										letterSpacing: '-0.07em',
										lineHeight: 1,
									}}
								>
									{countTo(frame, machine.value, delay, 28)}%
								</span>
							</div>
							<div style={{ marginTop: 16 }}>
								<Meter
									color={machine.color}
									delay={delay}
									frame={frame}
									glow
									height={22}
									value={machine.value}
								/>
							</div>
						</div>
					)
				})}
			</div>
		</AbsoluteFill>
	)
}

// The three meters slide together into one bar: still one subscription.
function OneBarEndScene() {
	const frame = useCurrentFrame()
	const fuse = pop(frame, 4, 110)

	return (
		<EndScene>
			<div style={{ display: 'flex', gap: (1 - fuse) * 44 + 5, marginTop: 64, width: '100%' }}>
				{MACHINES.map(machine => (
					<div
						key={machine.name}
						style={{
							background: machine.color,
							borderRadius: 999,
							boxShadow: `0 0 ${fuse * 38}px ${machine.color}88`,
							height: 26,
							transform: `scaleY(${0.4 + fuse * 0.6})`,
							width: `${machine.value}%`,
						}}
					/>
				))}
			</div>
			<KineticTitle delay={12} lines={['One sub. Every machine.']} size={62} style={{ marginTop: 40 }} />
		</EndScene>
	)
}

export function DontBuyASecondPlan() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={90}>
				<Camera duration={90}>
					<HookScene />
				</Camera>
			</Sequence>
			<Sequence from={82} durationInFrames={94}>
				<Camera duration={94}>
					<OneSubScene duration={94} />
				</Camera>
			</Sequence>
			<Sequence from={168} durationInFrames={96}>
				<Camera duration={96}>
					<BlindScene duration={96} />
				</Camera>
			</Sequence>
			<Sequence from={256} durationInFrames={100}>
				<Camera duration={100}>
					<SplitScene duration={100} />
				</Camera>
			</Sequence>
			<Sequence from={348} durationInFrames={102}>
				<Camera duration={102}>
					<OneBarEndScene />
				</Camera>
			</Sequence>

			<VoiceOver video='DontBuyASecondPlan' />

			<Impact at={6} color='rgba(245,158,11,0.28)' />
			<Impact at={96} color='rgba(16,185,129,0.24)' />
			<Impact at={176} color='rgba(245,158,11,0.22)' />
			<ProgressBar />

			<Sound src='sfx/music.wav' volume={0.32} />
			<Sound at={6} src='sfx/hit.wav' volume={1} />
			<Sound at={82} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={96} src='sfx/pop.wav' volume={0.5} />
			<Sound at={168} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={176} src='sfx/pop.wav' volume={0.5} />
			<Sound at={256} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={260} src='sfx/pop.wav' volume={0.4} />
			<Sound at={284} src='sfx/pop.wav' volume={0.4} />
			<Sound at={348} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={368} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-10.mp4' />
		</VideoCanvas>
	)
}
