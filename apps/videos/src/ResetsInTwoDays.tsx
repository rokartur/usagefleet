import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import {
	Camera,
	CheckRow,
	COLORS,
	countTo,
	DeviceIcon,
	DeviceRow,
	EndCard,
	firstSceneOpacity,
	GameplayStrip,
	Impact,
	KineticTitle,
	Meter,
	Pill,
	popIn,
	ProgressBar,
	progress,
	sceneOpacity,
	shake,
	Sound,
	Surface,
	VideoCanvas,
	VoiceOver,
	WindowCard,
} from './CampaignKit'

// Top 90 px clears TikTok's status bar, bottom 640 px clears the gameplay
// strip (y 1360) and the captions above it.
const SCENE_PADDING = '90px 72px 640px'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'

const MACHINES = [
	{ color: COLORS.indigo, kind: 'laptop' as const, name: 'MacBook', value: 58 },
	{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Mac Studio', value: 31 },
	{ color: COLORS.amber, kind: 'server' as const, name: 'Home server', value: 11 },
]

function HookScene() {
	const frame = useCurrentFrame()
	const duration = 90
	const slam = 16
	const kick = shake(frame, slam, 11)
	// Real-time seconds so the clock is visibly alive while the line lands.
	const seconds = 33 - Math.max(0, Math.floor((frame - slam) / 30))

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>
				<span style={{ background: COLORS.red, borderRadius: 999, height: 10, width: 10 }} />
				Claude Code · weekly window
			</Pill>
			<KineticTitle
				accentColor={COLORS.red}
				accentWords={['hit.']}
				delay={-6}
				lines={['Limit hit.']}
				size={110}
				style={{ marginTop: 56 }}
			/>

			<Surface color={COLORS.red} style={{ marginTop: 44, padding: '30px 34px 34px', ...popIn(frame, slam - 4) }}>
				<div style={{ color: COLORS.muted, fontSize: 26 }}>Resets in</div>
				<div
					style={{
						color: COLORS.text,
						fontSize: 150,
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 720,
						letterSpacing: '-0.07em',
						lineHeight: 1,
						marginTop: 8,
					}}
				>
					2d 04h
				</div>
				<div
					style={{
						color: COLORS.red,
						fontSize: 58,
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 650,
						letterSpacing: '-0.04em',
						marginTop: 6,
					}}
				>
					12m {String(seconds).padStart(2, '0')}s
				</div>
			</Surface>

			<div
				style={{
					color: COLORS.muted,
					fontFamily: MONO,
					fontSize: 24,
					lineHeight: 1.6,
					marginTop: 40,
					opacity: progress(frame, 34, 10) * 0.85,
				}}
			>
				<div style={{ textDecoration: 'line-through' }}>› refactor the auth middleware</div>
				<div style={{ color: COLORS.red }}>usage limit reached, try again later</div>
			</div>
		</AbsoluteFill>
	)
}

function WhichOneScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()

	return (
		<AbsoluteFill
			style={{ justifyContent: 'center', opacity: sceneOpacity(frame, duration), padding: SCENE_PADDING }}
		>
			<KineticTitle lines={['Three machines.', 'Which one burned it?']} size={80} />
			<div style={{ display: 'grid', gap: 22, marginTop: 56 }}>
				{MACHINES.map((machine, index) => {
					const appear = progress(frame, 10 + index * 4, 14)
					// The suspicion hops between rows so the question keeps moving.
					const suspect = frame >= 30 && Math.floor(frame / 9) % MACHINES.length === index
					return (
						<Surface
							key={machine.name}
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
							<div style={{ color: COLORS.muted }}>
								<DeviceIcon kind={machine.kind} size={44} />
							</div>
							<div>
								<div style={{ color: COLORS.text, fontSize: 27, fontWeight: 590 }}>{machine.name}</div>
								<div style={{ marginTop: 14 }}>
									<Meter frame={frame} value={0} />
								</div>
							</div>
							<div
								style={{
									color: suspect ? COLORS.red : COLORS.muted,
									fontSize: 42,
									fontWeight: 680,
									letterSpacing: '-0.045em',
									textAlign: 'right',
								}}
							>
								?%
							</div>
						</Surface>
					)
				})}
			</div>
			<div style={{ color: COLORS.muted, fontSize: 28, marginTop: 40, opacity: progress(frame, 34, 10) }}>
				Anthropic gives one number for the account.
			</div>
		</AbsoluteFill>
	)
}

function SplitScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()

	return (
		<AbsoluteFill
			style={{ justifyContent: 'center', opacity: sceneOpacity(frame, duration), padding: SCENE_PADDING }}
		>
			<KineticTitle
				accentColor={COLORS.emerald}
				accentWords={['machine.']}
				lines={['Split by machine.']}
				size={80}
			/>
			{/* Carried over from the hook: already at 100% when the scene fades in, so the split is the only motion. */}
			<div style={{ marginTop: 44 }}>
				<WindowCard
					color={COLORS.red}
					delay={-30}
					frame={frame}
					label="Weekly · Anthropic's number"
					reset='resets in 2d 04h'
					value={100}
				/>
			</div>
			<div style={{ display: 'grid', gap: 22, marginTop: 30 }}>
				{MACHINES.map((machine, index) => (
					<DeviceRow
						key={machine.name}
						color={machine.color}
						delay={16 + index * 5}
						frame={frame}
						kind={machine.kind}
						label={machine.name}
						value={machine.value}
					/>
				))}
			</div>
		</AbsoluteFill>
	)
}

function AlertScene({ duration }: { duration: number }) {
	const frame = useCurrentFrame()
	// Same 24-frame ramp as Meter, so digits and bar agree.
	const value = countTo(frame, 80, 8, 24)

	return (
		<AbsoluteFill
			style={{ justifyContent: 'center', opacity: sceneOpacity(frame, duration), padding: SCENE_PADDING }}
		>
			<KineticTitle
				accentColor={COLORS.amber}
				accentWords={['80%.']}
				lines={['Alert at 80%.', 'See it coming.']}
				size={80}
			/>
			<Surface style={{ marginTop: 52, padding: '28px 30px', ...popIn(frame, 4) }}>
				<div style={{ color: COLORS.muted, fontSize: 22 }}>Weekly</div>
				<div
					style={{
						color: value >= 80 ? COLORS.amber : COLORS.text,
						fontSize: 82,
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 650,
						letterSpacing: '-0.06em',
						lineHeight: 1,
						marginTop: 12,
					}}
				>
					{value}%
				</div>
				<div style={{ marginTop: 22 }}>
					<Meter color={COLORS.amber} delay={8} frame={frame} value={80} />
				</div>
			</Surface>

			<Surface color={COLORS.amber} style={{ marginTop: 26, padding: '24px 28px', ...popIn(frame, 36) }}>
				<div style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', fontSize: 21, gap: 12 }}>
					<span style={{ background: COLORS.amber, borderRadius: 999, height: 10, width: 10 }} />
					UsageFleet · now
				</div>
				<div style={{ color: COLORS.text, fontSize: 34, fontWeight: 600, marginTop: 10 }}>
					Weekly window at 80%.
				</div>
				<div style={{ color: COLORS.muted, fontSize: 24, marginTop: 6 }}>MacBook is driving it.</div>
			</Surface>

			<div style={{ marginTop: 26 }}>
				<CheckRow delay={52} frame={frame}>
					Guard blocks at 100%. Offline, it fails open.
				</CheckRow>
			</div>
		</AbsoluteFill>
	)
}

export function ResetsInTwoDays() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={90}>
				<Camera duration={90}>
					<HookScene />
				</Camera>
			</Sequence>
			<Sequence from={82} durationInFrames={94}>
				<Camera duration={94}>
					<WhichOneScene duration={94} />
				</Camera>
			</Sequence>
			<Sequence from={168} durationInFrames={96}>
				<Camera duration={96}>
					<SplitScene duration={96} />
				</Camera>
			</Sequence>
			<Sequence from={256} durationInFrames={100}>
				<Camera duration={100}>
					<AlertScene duration={100} />
				</Camera>
			</Sequence>
			<Sequence from={348} durationInFrames={102}>
				<Camera duration={102}>
					<EndCard kicker='No prompts. No responses. No file contents.' title='Next time, see it coming.' />
				</Camera>
			</Sequence>

			<VoiceOver video='ResetsInTwoDays' />

			<Impact at={16} color='rgba(255,91,87,0.28)' />
			<Impact at={292} color='rgba(245,158,11,0.22)' />
			<ProgressBar />

			{/* Real track, not the synthesized pulse bed: the gaps between lines were reading as silence. */}
			<Sound src='sfx/drive.wav' volume={0.32} />
			<Sound at={16} src='sfx/hit.wav' volume={1} />
			<Sound at={82} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={92} src='sfx/pop.wav' volume={0.4} />
			<Sound at={168} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={184} src='sfx/pop.wav' volume={0.5} />
			<Sound at={256} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={292} src='sfx/pop.wav' volume={0.5} />
			<Sound at={348} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={368} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-7.mp4' />
		</VideoCanvas>
	)
}
