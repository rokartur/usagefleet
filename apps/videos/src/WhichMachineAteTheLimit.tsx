import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion'
import {
	Camera,
	CheckRow,
	COLORS,
	countTo,
	DeviceIcon,
	EASE_IN_OUT,
	EndCard,
	firstSceneOpacity,
	GameplayStrip,
	Meter,
	Pill,
	progress,
	rise,
	sceneOpacity,
	Sound,
	Surface,
	UsageFleetMark,
	VideoCanvas,
	VoiceOver,
	clamp,
} from './CampaignKit'

// Bottom bias keeps the optical centre above TikTok's caption/action overlay.
const SCENE_PADDING = '90px 72px 640px'

function HookScene() {
	const frame = useCurrentFrame()
	const duration = 72
	const fill = progress(frame, 10, 28, EASE_IN_OUT)
	const number = Math.round(interpolate(fill, [0, 1], [0, 100]))
	const hit = progress(frame, 38, 10)
	// Impact shake when the counter slams into 100%.
	const shakeAmp = interpolate(frame, [38, 41, 58], [0, 11, 0], clamp)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
				transform: `translate3d(${Math.sin(frame * 2.3) * shakeAmp}px, ${Math.cos(frame * 1.7) * shakeAmp * 0.6}px, 0)`,
			}}
		>
			<div style={{ ...rise(frame, -10), width: '100%' }}>
				<Pill style={{ width: 'fit-content' }}>
					<span style={{ background: COLORS.emerald, borderRadius: 999, height: 10, width: 10 }} />
					Claude Code · 3 machines
				</Pill>
			</div>

			<div style={{ ...rise(frame, -4), marginTop: 110 }}>
				<div
					style={{
						color: COLORS.text,
						fontSize: 76,
						fontWeight: 620,
						letterSpacing: '-0.045em',
						lineHeight: 1.04,
						maxWidth: 850,
					}}
				>
					Your Claude limit
					<br />
					just hit
				</div>
			</div>

			<div
				style={{
					alignItems: 'flex-end',
					display: 'flex',
					height: 285,
					marginTop: 16,
					transform: `scale(${0.94 + hit * 0.06})`,
					transformOrigin: 'left bottom',
				}}
			>
				<span
					style={{
						color: number === 100 ? COLORS.red : COLORS.text,
						fontSize: 250,
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 760,
						letterSpacing: '-0.075em',
						lineHeight: 0.85,
					}}
				>
					{number}%
				</span>
			</div>

			<div
				style={{
					background: 'rgba(255,255,255,0.12)',
					borderRadius: 999,
					height: 22,
					marginTop: 48,
					overflow: 'hidden',
					width: '100%',
				}}
			>
				<div
					style={{
						background: fill > 0.9 ? COLORS.red : COLORS.text,
						borderRadius: 999,
						boxShadow: fill > 0.9 ? '0 0 34px rgba(255,91,87,0.45)' : 'none',
						height: '100%',
						transform: `scaleX(${fill})`,
						transformOrigin: 'left',
					}}
				/>
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 28,
					marginTop: 28,
					opacity: progress(frame, 42, 10),
				}}
			>
				Account-wide. No machine breakdown.
			</div>
		</AbsoluteFill>
	)
}

const DEVICES = [
	{ color: COLORS.indigo, kind: 'laptop' as const, name: 'MacBook', value: 32 },
	{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Mac Studio', value: 51 },
	{ color: COLORS.amber, kind: 'server' as const, name: 'Server', value: 17 },
]

function DeviceCard({
	color,
	index,
	kind,
	name,
	value,
	frame,
}: (typeof DEVICES)[number] & { index: number; frame: number }) {
	const appear = progress(frame, 6 + index * 3, 14)
	const resolve = progress(frame, 50 + index * 6, 14)
	const shownValue = Math.round(value * resolve)

	return (
		<Surface
			color={resolve > 0.2 ? color : undefined}
			style={{
				height: 252,
				opacity: appear,
				overflow: 'hidden',
				padding: '30px 30px 26px',
				transform: `translate3d(0, ${(1 - appear) * 44}px, 0)`,
			}}
		>
			<div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
				<div style={{ color, opacity: 0.95 }}>
					<DeviceIcon kind={kind} />
				</div>
				<div
					style={{
						color: resolve > 0.1 ? COLORS.text : COLORS.muted,
						fontSize: 62,
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 680,
						letterSpacing: '-0.05em',
						lineHeight: 1,
					}}
				>
					{resolve > 0.02 ? `${shownValue}%` : '?%'}
				</div>
			</div>
			<div style={{ color: COLORS.text, fontSize: 30, fontWeight: 580, marginTop: 32 }}>{name}</div>
			<div style={{ marginTop: 22 }}>
				<Meter color={color} delay={50 + index * 6} frame={frame} height={10} value={value} />
			</div>
		</Surface>
	)
}

function MachinesScene() {
	const frame = useCurrentFrame()
	const duration = 112
	const questionOut = interpolate(frame, [36, 54], [1, 0], clamp)
	const answerIn = progress(frame, 46, 14)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<div style={{ ...rise(frame), alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
				<Pill>
					<span style={{ background: COLORS.red, borderRadius: 999, height: 10, width: 10 }} />
					100% used
				</Pill>
				<div style={{ color: COLORS.muted, fontSize: 24 }}>one subscription</div>
			</div>

			<div style={{ height: 320, marginTop: 90, position: 'relative' }}>
				<div
					style={{
						color: COLORS.text,
						fontSize: 84,
						fontWeight: 650,
						letterSpacing: '-0.05em',
						lineHeight: 1.02,
						opacity: questionOut,
						position: 'absolute',
						transform: `translate3d(0, ${-24 * (1 - questionOut)}px, 0)`,
					}}
				>
					Cool.
					<br />
					Which machine did it?
				</div>
				<div
					style={{
						color: COLORS.text,
						fontSize: 96,
						fontWeight: 670,
						letterSpacing: '-0.055em',
						lineHeight: 1,
						opacity: answerIn,
						position: 'absolute',
						transform: `translate3d(0, ${42 * (1 - answerIn)}px, 0)`,
					}}
				>
					Stop guessing.
					<div
						style={{
							color: COLORS.muted,
							fontSize: 34,
							fontWeight: 450,
							letterSpacing: '-0.02em',
							marginTop: 28,
						}}
					>
						See each machine’s share of the window.
					</div>
				</div>
			</div>

			<div style={{ display: 'grid', gap: 22 }}>
				{DEVICES.map((device, index) => (
					<DeviceCard key={device.name} {...device} index={index} frame={frame} />
				))}
			</div>
		</AbsoluteFill>
	)
}

function DashboardScene() {
	const frame = useCurrentFrame()
	const duration = 138
	const appear = progress(frame, 0, 14)
	const camera = interpolate(frame, [0, duration], [0.96, 1.02], { ...clamp, easing: EASE_IN_OUT })
	const session = countTo(frame, 41, 16, 22)
	const weekly = countTo(frame, 44, 20, 22)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 8),
				padding: '70px 52px 600px',
			}}
		>
			<div
				style={{
					background: '#050505',
					border: `1px solid ${COLORS.border}`,
					borderRadius: 40,
					height: 1320,
					opacity: appear,
					overflow: 'hidden',
					padding: '44px 42px',
					transform: `translate3d(0, ${(1 - appear) * 70}px, 0) scale(${camera})`,
				}}
			>
				<div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
					<div
						style={{
							alignItems: 'center',
							color: COLORS.text,
							display: 'flex',
							fontSize: 30,
							fontWeight: 620,
							gap: 16,
						}}
					>
						<UsageFleetMark size={38} />
						UsageFleet
					</div>
					<div style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', fontSize: 22, gap: 10 }}>
						<span style={{ background: COLORS.emerald, borderRadius: 999, height: 10, width: 10 }} />
						live
					</div>
				</div>

				<div
					style={{
						borderBottom: `1px solid ${COLORS.border}`,
						borderTop: `1px solid ${COLORS.border}`,
						display: 'grid',
						gap: 28,
						gridTemplateColumns: '1fr 1fr',
						marginTop: 42,
						padding: '36px 0 40px',
					}}
				>
					{[
						{ delay: 16, label: '5-hour session', value: session },
						{ delay: 20, label: 'Weekly', value: weekly },
					].map(item => (
						<div key={item.label}>
							<div style={{ color: COLORS.muted, fontSize: 21 }}>{item.label}</div>
							<div
								style={{
									color: COLORS.text,
									fontSize: 82,
									fontVariantNumeric: 'tabular-nums',
									fontWeight: 610,
									letterSpacing: '-0.055em',
									marginTop: 12,
								}}
							>
								{item.value}%
							</div>
							<div style={{ marginTop: 12 }}>
								<Meter
									color={COLORS.text}
									delay={item.delay}
									frame={frame}
									height={10}
									value={item.value}
								/>
							</div>
							<div style={{ color: COLORS.muted, fontSize: 19, marginTop: 14 }}>
								resets in {item.label === 'Weekly' ? '3d 8h' : '2h 13m'}
							</div>
						</div>
					))}
				</div>

				<div
					style={{
						color: COLORS.muted,
						fontSize: 20,
						fontWeight: 620,
						letterSpacing: '0.1em',
						marginTop: 38,
						textTransform: 'uppercase',
					}}
				>
					Groups
				</div>

				<div style={{ marginTop: 16 }}>
					{[
						{ color: COLORS.indigo, name: 'Laptops', session: 78, weekly: 61 },
						{ color: COLORS.emerald, name: 'Work desktops', session: 34, weekly: 48 },
						{ color: COLORS.amber, name: 'Home server', session: 9, weekly: 22 },
					].map((group, index) => {
						const row = progress(frame, 30 + index * 4, 14)
						return (
							<div
								key={group.name}
								style={{
									borderBottom: `1px solid ${COLORS.border}`,
									display: 'grid',
									gap: 18,
									gridTemplateColumns: '1.25fr 0.8fr 0.8fr',
									opacity: row,
									padding: '34px 0',
									transform: `translate3d(0, ${(1 - row) * 22}px, 0)`,
								}}
							>
								<div
									style={{
										alignItems: 'center',
										color: COLORS.text,
										display: 'flex',
										fontSize: 26,
										fontWeight: 560,
										gap: 14,
									}}
								>
									<span
										style={{ background: group.color, borderRadius: 999, height: 14, width: 14 }}
									/>
									{group.name}
								</div>
								<div>
									<div
										style={{ color: COLORS.text, fontSize: 27, fontVariantNumeric: 'tabular-nums' }}
									>
										{group.session}%
									</div>
									<div style={{ marginTop: 12 }}>
										<Meter
											color={group.color}
											delay={34 + index * 4}
											frame={frame}
											height={10}
											value={group.session}
										/>
									</div>
								</div>
								<div>
									<div
										style={{ color: COLORS.text, fontSize: 27, fontVariantNumeric: 'tabular-nums' }}
									>
										{group.weekly}%
									</div>
									<div style={{ marginTop: 12 }}>
										<Meter
											color={COLORS.text}
											delay={38 + index * 4}
											frame={frame}
											height={10}
											value={group.weekly}
										/>
									</div>
								</div>
							</div>
						)
					})}
				</div>

				<div
					style={{
						background: 'rgba(255,255,255,0.05)',
						border: `1px solid ${COLORS.border}`,
						borderRadius: 28,
						marginTop: 48,
						opacity: progress(frame, 56, 14),
						padding: '28px 30px',
					}}
				>
					<div style={{ color: COLORS.text, fontSize: 29, fontWeight: 600 }}>Anthropic’s account total.</div>
					<div style={{ color: COLORS.muted, fontSize: 23, lineHeight: 1.35, marginTop: 10 }}>
						Attributed across the groups in your fleet.
					</div>
				</div>
			</div>
		</AbsoluteFill>
	)
}

function PrivacyScene() {
	const frame = useCurrentFrame()
	const duration = 104

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Privacy boundary</Pill>
			<div
				style={{
					...rise(frame, 4),
					color: COLORS.text,
					fontSize: 90,
					fontWeight: 660,
					letterSpacing: '-0.055em',
					lineHeight: 1.02,
					marginTop: 100,
				}}
			>
				Your work
				<br />
				stays yours.
			</div>
			<div
				style={{
					color: COLORS.muted,
					fontSize: 30,
					lineHeight: 1.45,
					marginTop: 34,
					opacity: progress(frame, 8, 10),
				}}
			>
				The collector reports counters and machine context.
				<br />
				Not the work itself.
			</div>

			{/* Row reveals ride the VO beats: "no prompts / no responses / no file contents". */}
			<div style={{ display: 'grid', gap: 18, marginTop: 84 }}>
				<CheckRow delay={6} frame={frame}>
					No prompts
				</CheckRow>
				<CheckRow delay={34} frame={frame}>
					No responses
				</CheckRow>
				<CheckRow delay={66} frame={frame}>
					No file contents
				</CheckRow>
			</div>
		</AbsoluteFill>
	)
}

export function WhichMachineAteTheLimit() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={72}>
				<Camera duration={72}>
					<HookScene />
				</Camera>
			</Sequence>
			<Sequence from={64} durationInFrames={112}>
				<Camera duration={112}>
					<MachinesScene />
				</Camera>
			</Sequence>
			<Sequence from={168} durationInFrames={138}>
				<Camera duration={138}>
					<DashboardScene />
				</Camera>
			</Sequence>
			<Sequence from={298} durationInFrames={104}>
				<Camera duration={104}>
					<PrivacyScene />
				</Camera>
			</Sequence>
			<Sequence from={394} durationInFrames={56}>
				<Camera duration={56}>
					<EndCard
						kicker='Claude Code · every machine · one view'
						title={
							<>
								Find the machine
								<br />
								eating your Claude limit.
							</>
						}
					/>
				</Camera>
			</Sequence>

			{/* Voiceover + captions — one clip per scene, absolute frame positions. */}
			<VoiceOver video='WhichMachineAteTheLimit' />

			{/* Music bed under everything; SFX punch through it. */}
			<Sound src='sfx/music.wav' volume={0.32} />
			<Sound at={38} src='sfx/hit.wav' volume={1} />
			<Sound at={64} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={72} src='sfx/pop.wav' volume={0.45} />
			<Sound at={114} src='sfx/pop.wav' volume={0.5} />
			<Sound at={168} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={198} src='sfx/pop.wav' volume={0.45} />
			<Sound at={298} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={306} src='sfx/pop.wav' volume={0.4} />
			<Sound at={334} src='sfx/pop.wav' volume={0.4} />
			<Sound at={366} src='sfx/pop.wav' volume={0.4} />
			<Sound at={394} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={400} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-1.mp4' />
		</VideoCanvas>
	)
}
