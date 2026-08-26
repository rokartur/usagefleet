import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import {
	Camera,
	COLORS,
	countTo,
	DeviceIcon,
	EndCard,
	firstSceneOpacity,
	GameplayStrip,
	Impact,
	KineticTitle,
	Meter,
	Pill,
	pop,
	popIn,
	ProgressBar,
	progress,
	sceneOpacity,
	shake,
	Sound,
	Surface,
	VideoCanvas,
} from './CampaignKit'

// Bottom bias keeps the optical centre above TikTok's caption/action overlay.
const SCENE_PADDING = '90px 72px 640px'

const FLEET = [
	{ color: COLORS.indigo, group: 'Laptops', kind: 'laptop' as const, name: 'Product laptop' },
	{ color: COLORS.indigo, group: 'Laptops', kind: 'laptop' as const, name: 'Research laptop' },
	{ color: COLORS.emerald, group: 'Workstations', kind: 'desktop' as const, name: 'Design desktop' },
	{ color: COLORS.emerald, group: 'Workstations', kind: 'desktop' as const, name: 'Build desktop' },
	{ color: COLORS.amber, group: 'CI', kind: 'server' as const, name: 'CI node 1' },
	{ color: COLORS.amber, group: 'CI', kind: 'server' as const, name: 'CI node 2' },
]

function HookScene() {
	const frame = useCurrentFrame()
	const duration = 90
	const complete = progress(frame, 40, 10)
	const kick = shake(frame, 42, 8)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Tech founders · operational view</Pill>
			{/* Negative delay: words are mid-flight on frame 0 so the hook reads instantly. */}
			<KineticTitle
				accentColor={COLORS.amber}
				accentWords={['budget']}
				delay={-6}
				lines={['Your team shares', 'an AI budget']}
				size={84}
				style={{ marginTop: 64, maxWidth: 930 }}
			/>

			<div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr', marginTop: 70 }}>
				{FLEET.map((device, index) => (
					<Surface
						key={device.name}
						color={device.color}
						style={{
							alignItems: 'center',
							display: 'grid',
							gap: 15,
							gridTemplateColumns: '48px 1fr',
							padding: '20px 22px',
							...popIn(frame, 6 + index * 5, 30),
						}}
					>
						<div style={{ color: device.color }}>
							<DeviceIcon kind={device.kind} size={42} />
						</div>
						<div>
							<div style={{ fontSize: 23, fontWeight: 600 }}>{device.name}</div>
							<div style={{ color: device.color, fontSize: 18, marginTop: 4 }}>{device.group}</div>
						</div>
					</Surface>
				))}
			</div>

			<div
				style={{
					alignItems: 'center',
					color: COLORS.muted,
					display: 'flex',
					fontSize: 26,
					gap: 14,
					justifyContent: 'center',
					marginTop: 44,
					opacity: complete,
				}}
			>
				<span style={{ background: COLORS.emerald, borderRadius: 999, height: 12, width: 12 }} />
				One Claude subscription. Six machines reporting.
			</div>
		</AbsoluteFill>
	)
}

function AnonymousScene() {
	const frame = useCurrentFrame()
	const duration = 90
	// Source labels fade out — the account total keeps no memory of them.
	const fade = progress(frame, 24, 24)
	const total = progress(frame, 20, 18)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<KineticTitle
				accentColor={COLORS.red}
				accentWords={['where']}
				lines={['Does anyone know', 'where it goes?']}
				size={84}
			/>

			<div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 76 }}>
				{['Laptops', 'Workstations', 'CI'].map((group, index) => (
					<div
						key={group}
						style={{
							background: 'rgba(255,255,255,0.07)',
							border: `1px solid ${COLORS.border}`,
							borderRadius: 999,
							color: COLORS.muted,
							fontSize: 24,
							fontWeight: 640,
							opacity: (1 - fade) * progress(frame, 4 + index * 3, 10),
							padding: '14px 24px',
						}}
					>
						{group}
					</div>
				))}
			</div>

			<div
				style={{
					background: `linear-gradient(to bottom, rgba(255,255,255,${0.24 * (1 - fade)}), rgba(255,255,255,0.05))`,
					height: 70,
					margin: '10px auto 0',
					transform: `scaleY(${total})`,
					transformOrigin: 'top',
					width: 2,
				}}
			/>

			<Surface
				style={{
					marginTop: 10,
					opacity: Math.min(1, total * 1.4),
					padding: '34px 36px',
					transform: `translate3d(0, ${(1 - total) * 30}px, 0)`,
				}}
			>
				<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
					<div>
						<div style={{ color: COLORS.muted, fontSize: 22 }}>Anthropic account · 5-hour window</div>
						<div style={{ fontSize: 30, fontWeight: 610, marginTop: 9 }}>One anonymous percentage</div>
					</div>
					<div
						style={{
							fontSize: 96,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 710,
							letterSpacing: '-0.065em',
						}}
					>
						{countTo(frame, 63, 22, 26)}%
					</div>
				</div>
				<div style={{ marginTop: 26 }}>
					<Meter delay={24} frame={frame} glow height={16} value={63} />
				</div>
				<div style={{ color: COLORS.muted, fontSize: 24, marginTop: 24, opacity: fade }}>
					Source: unknown. Every group looks the same.
				</div>
			</Surface>
		</AbsoluteFill>
	)
}

function GroupsScene() {
	const frame = useCurrentFrame()
	const duration = 98

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<div style={{ ...popIn(frame, 0, 24), alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
				<Pill>
					<span style={{ background: COLORS.emerald, borderRadius: 999, height: 10, width: 10 }} />
					UsageFleet · live
				</Pill>
				<div style={{ color: COLORS.muted, fontSize: 24 }}>5h + weekly</div>
			</div>

			<KineticTitle
				accentColor={COLORS.emerald}
				accentWords={['Live.']}
				delay={2}
				lines={['See the window', 'by group. Live.']}
				size={82}
				style={{ marginTop: 60 }}
			/>

			<div style={{ display: 'grid', gap: 18, marginTop: 66 }}>
				{[
					{ color: COLORS.indigo, kind: 'laptop' as const, name: 'Laptops', value: 78 },
					{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Workstations', value: 34 },
					{ color: COLORS.amber, kind: 'server' as const, name: 'CI', value: 51 },
				].map((group, index) => (
					<Surface
						key={group.name}
						color={group.color}
						style={{
							alignItems: 'center',
							display: 'grid',
							gap: 22,
							gridTemplateColumns: '54px 1fr 200px',
							padding: '24px 28px',
							...popIn(frame, 10 + index * 7),
						}}
					>
						<div style={{ color: group.color }}>
							<DeviceIcon kind={group.kind} size={44} />
						</div>
						<div>
							<div style={{ fontSize: 28, fontWeight: 600 }}>{group.name}</div>
							<div style={{ marginTop: 14 }}>
								<Meter
									color={group.color}
									delay={14 + index * 7}
									frame={frame}
									glow
									height={12}
									value={group.value}
								/>
							</div>
						</div>
						<div style={{ textAlign: 'right' }}>
							<span
								style={{
									fontSize: 44,
									fontVariantNumeric: 'tabular-nums',
									fontWeight: 690,
								}}
							>
								{countTo(frame, group.value, 14 + index * 7, 20)}%
							</span>
							<span style={{ color: COLORS.muted, fontSize: 21, marginLeft: 10 }}>of budget</span>
						</div>
					</Surface>
				))}
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 25,
					marginTop: 36,
					opacity: progress(frame, 40, 14),
					textAlign: 'center',
				}}
			>
				Anthropic's account total, attributed across your groups.
			</div>
		</AbsoluteFill>
	)
}

function ThresholdCard({
	color,
	delay,
	frame,
	label,
	subtitle,
	value,
}: {
	color: string
	delay: number
	frame: number
	label: string
	subtitle: string
	value: string
}) {
	const landed = pop(frame, delay)

	return (
		<Surface
			color={color}
			style={{
				alignItems: 'center',
				boxShadow: `0 0 44px ${color}${frame >= delay ? '2e' : '00'}`,
				display: 'grid',
				gap: 24,
				gridTemplateColumns: '140px 1fr',
				opacity: Math.min(1, landed * 1.6),
				padding: '28px 30px',
				transform: `translate3d(0, ${(1 - landed) * 30}px, 0) scale(${0.94 + landed * 0.06})`,
			}}
		>
			<div
				style={{
					color,
					fontSize: 48,
					fontVariantNumeric: 'tabular-nums',
					fontWeight: 700,
					textAlign: 'center',
					transform: `scale(${1 + (1 - Math.min(1, landed)) * 0.5})`,
				}}
			>
				{value}
			</div>
			<div>
				<div style={{ fontSize: 31, fontWeight: 630 }}>{label}</div>
				<div style={{ color: COLORS.muted, fontSize: 22, lineHeight: 1.35, marginTop: 8 }}>{subtitle}</div>
			</div>
		</Surface>
	)
}

function GuardScene() {
	const frame = useCurrentFrame()
	const duration = 114
	const offline = progress(frame, 64, 14)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Operational controls</Pill>
			<KineticTitle
				accentColor={COLORS.emerald}
				accentWords={['open.']}
				delay={2}
				lines={['Alert early.', 'Guard fails open.']}
				size={80}
				style={{ marginTop: 62 }}
			/>

			<div style={{ display: 'grid', gap: 20, marginTop: 66 }}>
				<ThresholdCard
					color={COLORS.amber}
					delay={12}
					frame={frame}
					label='Alert fires'
					subtitle='First crossing of the window threshold.'
					value='80%'
				/>
				<ThresholdCard
					color={COLORS.red}
					delay={32}
					frame={frame}
					label='Guard blocks'
					subtitle='Only on an explicit, fresh blocked signal.'
					value='100%'
				/>
				<ThresholdCard
					color={COLORS.emerald}
					delay={56}
					frame={frame}
					label='Tracker offline'
					subtitle='Fails open. Work continues.'
					value={offline > 0.6 ? 'PASS' : '…'}
				/>
			</div>
		</AbsoluteFill>
	)
}

export function ClaudeFleetForTeams() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={90}>
				<Camera duration={90}>
					<HookScene />
				</Camera>
			</Sequence>
			<Sequence from={82} durationInFrames={90}>
				<Camera duration={90}>
					<AnonymousScene />
				</Camera>
			</Sequence>
			<Sequence from={164} durationInFrames={98}>
				<Camera duration={98}>
					<GroupsScene />
				</Camera>
			</Sequence>
			<Sequence from={254} durationInFrames={114}>
				<Camera duration={114}>
					<GuardScene />
				</Camera>
			</Sequence>
			<Sequence from={360} durationInFrames={90}>
				<Camera duration={90}>
					<EndCard
						kicker='No prompts · tokens stored hashed'
						title={
							<>
								Built for teams using
								<br />
								Claude Code way too much
							</>
						}
					/>
				</Camera>
			</Sequence>

			{/* Voiceover — one clip per scene, absolute frame positions. */}
			<Sound at={8} src='vo/v6-s1.wav' />
			<Sound at={86} src='vo/v6-s2.wav' />
			<Sound at={166} src='vo/v6-s3.wav' />
			<Sound at={264} src='vo/v6-s4.wav' />
			<Sound at={375} src='vo/v6-s5.wav' />

			{/* Impact flashes ride the hit and the threshold slams. */}
			<Impact at={42} />
			<Impact at={268} color='rgba(245,158,11,0.16)' />
			<Impact at={288} color='rgba(255,91,87,0.18)' />
			<Impact at={312} color='rgba(16,185,129,0.16)' />
			<ProgressBar />

			{/* Music bed under everything; SFX punch through it. */}
			<Sound src='sfx/music.wav' volume={0.32} />
			<Sound at={42} src='sfx/hit.wav' volume={1} />
			<Sound at={82} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={104} src='sfx/pop.wav' volume={0.4} />
			<Sound at={164} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={176} src='sfx/pop.wav' volume={0.5} />
			<Sound at={184} src='sfx/pop.wav' volume={0.5} />
			<Sound at={192} src='sfx/pop.wav' volume={0.5} />
			<Sound at={254} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={268} src='sfx/pop.wav' volume={0.45} />
			<Sound at={288} src='sfx/pop.wav' volume={0.45} />
			<Sound at={312} src='sfx/pop.wav' volume={0.45} />
			<Sound at={360} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={382} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-6.mp4' />
		</VideoCanvas>
	)
}
