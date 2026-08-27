import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion'
import {
	Camera,
	COLORS,
	countTo,
	DeviceIcon,
	EASE_IN_OUT,
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
	UsageFleetMark,
	VideoCanvas,
	VoiceOver,
} from './CampaignKit'

// Bottom bias keeps the optical centre above TikTok's caption/action overlay.
const SCENE_PADDING = '90px 72px 640px'

function HookScene() {
	const frame = useCurrentFrame()
	const duration = 90
	const dot = progress(frame, 6, 10)
	const card = pop(frame, 16)
	const stackTwo = pop(frame, 32)
	const stackThree = pop(frame, 42)
	const kick = shake(frame, 8, 7)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Indie makers · micro-SaaS</Pill>
			{/* Negative delay: words are mid-flight on frame 0 so the hook reads instantly. */}
			<KineticTitle
				accentColor={COLORS.indigo}
				accentWords={['recurring', 'irritation']}
				delay={-6}
				lines={['A micro-SaaS needs', 'one recurring irritation']}
				size={80}
				style={{ marginTop: 66, maxWidth: 930 }}
			/>

			<div style={{ height: 560, marginTop: 70, position: 'relative' }}>
				<div
					style={{
						background: COLORS.indigo,
						borderRadius: 999,
						boxShadow: '0 0 80px rgba(99,102,241,0.55)',
						height: 22,
						left: '50%',
						opacity: dot * (1 - card),
						position: 'absolute',
						top: 220,
						transform: `translateX(-50%) scale(${0.6 + dot * 0.4})`,
						width: 22,
					}}
				/>

				{/* The same card, three deep: the annoyance recurs every window. */}
				{[
					{ label: 'Again', offset: 100, p: stackThree, tilt: 1.6 },
					{ label: 'Later that day', offset: 50, p: stackTwo, tilt: -1.2 },
					{ label: 'This morning', offset: 0, p: card, tilt: 0 },
				].map(layer => (
					<Surface
						key={layer.label}
						color={layer.offset === 0 ? COLORS.indigo : undefined}
						style={{
							background: '#0a0a0a',
							boxShadow: layer.offset === 0 ? '0 30px 80px rgba(0,0,0,0.8)' : undefined,
							left: layer.offset,
							opacity: Math.min(1, layer.p * 1.6),
							padding: '30px 32px',
							position: 'absolute',
							right: layer.offset,
							top: 60 + layer.offset * 0.9,
							transform: `translate3d(0, ${(1 - layer.p) * 44}px, 0) scale(${0.93 + layer.p * 0.07}) rotate(${layer.tilt * layer.p}deg)`,
						}}
					>
						<div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
							<div>
								<div style={{ color: COLORS.muted, fontSize: 20 }}>{layer.label}</div>
								<div style={{ fontSize: 30, fontWeight: 620, marginTop: 8 }}>
									Claude usage moved again
								</div>
							</div>
							<div
								style={{
									fontSize: 66,
									fontVariantNumeric: 'tabular-nums',
									fontWeight: 700,
									letterSpacing: '-0.055em',
								}}
							>
								{layer.offset === 0 ? countTo(frame, 41, 18, 20) : 41}%
							</div>
						</div>
						<div style={{ marginTop: 24 }}>
							<Meter
								color={COLORS.indigo}
								delay={20}
								frame={frame}
								glow={layer.offset === 0}
								height={14}
								value={41}
							/>
						</div>
					</Surface>
				))}
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 29,
					opacity: progress(frame, 50, 14),
					textAlign: 'center',
				}}
			>
				Small problem. Frequent pain.
			</div>
		</AbsoluteFill>
	)
}

function NoBreakdownScene() {
	const frame = useCurrentFrame()
	const duration = 94

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
				accentWords={['No', 'breakdown.']}
				lines={['One total.', 'Several machines.', 'No breakdown.']}
				size={78}
			/>

			<Surface style={{ marginTop: 64, padding: '30px 32px', ...popIn(frame, 6) }}>
				<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
					<div style={{ color: COLORS.muted, fontSize: 23 }}>Anthropic account · 5-hour window</div>
					<div
						style={{
							fontSize: 66,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 700,
							letterSpacing: '-0.055em',
						}}
					>
						{countTo(frame, 41, 8, 20)}%
					</div>
				</div>
				<div style={{ marginTop: 22 }}>
					<Meter delay={10} frame={frame} glow height={14} value={41} />
				</div>
			</Surface>

			<div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 28 }}>
				{[
					{ color: COLORS.indigo, kind: 'laptop' as const, name: 'MacBook' },
					{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Studio' },
					{ color: COLORS.amber, kind: 'server' as const, name: 'Server' },
				].map((device, index) => (
					<Surface
						key={device.name}
						color={device.color}
						style={{
							alignItems: 'center',
							display: 'flex',
							flexDirection: 'column',
							padding: '28px 16px 25px',
							...popIn(frame, 16 + index * 5),
						}}
					>
						<div style={{ color: device.color }}>
							<DeviceIcon kind={device.kind} size={48} />
						</div>
						<div style={{ fontSize: 23, fontWeight: 610, marginTop: 15 }}>{device.name}</div>
						{/* Blank bar: this machine's share is simply unknown. */}
						<div
							style={{
								background: 'rgba(255,255,255,0.1)',
								borderRadius: 999,
								height: 10,
								marginTop: 22,
								width: '100%',
							}}
						/>
						{/* The unknown pulses — an open question, not a resting label. */}
						<div
							style={{
								color: COLORS.muted,
								fontSize: 34,
								fontWeight: 680,
								marginTop: 16,
								transform: `scale(${1 + Math.sin((frame - index * 6) * 0.18) * 0.09})`,
							}}
						>
							?
						</div>
					</Surface>
				))}
			</div>
		</AbsoluteFill>
	)
}

function FlowStep({
	color,
	delay,
	frame,
	label,
	number,
	subtitle,
}: {
	color: string
	delay: number
	frame: number
	label: string
	number: string
	subtitle: string
}) {
	return (
		<Surface
			color={color}
			style={{
				minHeight: 250,
				padding: '28px 27px',
				...popIn(frame, delay, 44),
			}}
		>
			<div
				style={{
					alignItems: 'center',
					background: `${color}1f`,
					border: `1px solid ${color}52`,
					borderRadius: 999,
					color,
					display: 'flex',
					fontSize: 20,
					fontWeight: 720,
					height: 44,
					justifyContent: 'center',
					width: 44,
				}}
			>
				{number}
			</div>
			<div style={{ fontSize: 30, fontWeight: 640, marginTop: 26 }}>{label}</div>
			<div style={{ color: COLORS.muted, fontSize: 21, lineHeight: 1.4, marginTop: 12 }}>{subtitle}</div>
		</Surface>
	)
}

function WholeProductScene() {
	const frame = useCurrentFrame()
	const duration = 108
	const lineOne = progress(frame, 22, 16)
	const lineTwo = progress(frame, 36, 16)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<KineticTitle
				accentColor={COLORS.emerald}
				accentWords={['whole']}
				lines={["That's the", 'whole product']}
				size={88}
			/>

			<div
				style={{
					display: 'grid',
					gap: 22,
					gridTemplateColumns: '1fr 1fr 1fr',
					marginTop: 84,
					position: 'relative',
				}}
			>
				<FlowStep
					color={COLORS.indigo}
					delay={10}
					frame={frame}
					label='Collector'
					number='1'
					subtitle='Tail local usage records.'
				/>
				<FlowStep
					color={COLORS.emerald}
					delay={22}
					frame={frame}
					label='Attribution'
					number='2'
					subtitle='Split each official rise.'
				/>
				<FlowStep
					color={COLORS.amber}
					delay={34}
					frame={frame}
					label='Dashboard'
					number='3'
					subtitle='Make the fleet legible.'
				/>

				<div
					style={{
						background: `linear-gradient(90deg, ${COLORS.indigo}, ${COLORS.emerald})`,
						height: 3,
						left: '31%',
						position: 'absolute',
						top: 124,
						transform: `scaleX(${lineOne})`,
						transformOrigin: 'left',
						width: '9%',
					}}
				/>
				<div
					style={{
						background: `linear-gradient(90deg, ${COLORS.emerald}, ${COLORS.amber})`,
						height: 3,
						left: '64%',
						position: 'absolute',
						top: 124,
						transform: `scaleX(${lineTwo})`,
						transformOrigin: 'left',
						width: '9%',
					}}
				/>
			</div>

			<Surface
				color={COLORS.indigo}
				style={{
					alignItems: 'center',
					display: 'flex',
					gap: 26,
					marginTop: 54,
					padding: '30px 32px',
					...popIn(frame, 48),
				}}
			>
				<UsageFleetMark size={64} />
				<div>
					<div style={{ color: COLORS.muted, fontSize: 20 }}>The answer</div>
					<div style={{ fontSize: 34, fontWeight: 650, letterSpacing: '-0.035em', marginTop: 7 }}>
						Where did the window go?
					</div>
				</div>
			</Surface>
		</AbsoluteFill>
	)
}

function ModuleCard({
	delay,
	frame,
	keep = false,
	label,
}: {
	delay: number
	frame: number
	keep?: boolean
	label: string
}) {
	const appear = pop(frame, 4 + delay * 0.2)
	const remove = keep ? 0 : progress(frame, delay, 12, EASE_IN_OUT)

	return (
		<Surface
			color={keep ? COLORS.indigo : undefined}
			style={{
				alignItems: 'center',
				display: 'flex',
				fontSize: 24,
				fontWeight: 610,
				justifyContent: 'space-between',
				minHeight: 112,
				opacity: Math.min(1, appear * 1.6) * (1 - remove),
				padding: '20px 23px',
				// Deleted modules get flicked off screen with a twist.
				transform: `translate3d(${remove * 130}px, ${(1 - appear) * 20}px, 0) rotate(${remove * 5}deg)`,
			}}
		>
			<span>{label}</span>
			<span style={{ color: keep ? COLORS.indigo : COLORS.red }}>{keep ? '✓' : '×'}</span>
		</Surface>
	)
}

function NotGiantScene() {
	const frame = useCurrentFrame()
	const duration = 90
	const focus = progress(frame, 56, 16)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Product strategy by deletion</Pill>
			<KineticTitle
				accentColor={COLORS.red}
				accentWords={['giant']}
				delay={2}
				lines={['Not another giant', 'AI dashboard']}
				size={76}
				style={{ marginTop: 64 }}
			/>

			<div
				style={{
					display: 'grid',
					gap: 16,
					gridTemplateColumns: '1fr 1fr',
					marginTop: 66,
				}}
			>
				<ModuleCard delay={16} frame={frame} label='Prompt scoring' />
				<ModuleCard delay={24} frame={frame} label='Agent chat' />
				<ModuleCard delay={32} frame={frame} label='Model routing' />
				<ModuleCard delay={40} frame={frame} label='AI marketplace' />
				<ModuleCard delay={48} frame={frame} label='Workflow builder' />
				<ModuleCard delay={56} frame={frame} keep label='Usage visibility' />
			</div>

			<Surface
				color={COLORS.indigo}
				style={{
					alignItems: 'center',
					boxShadow: `0 0 60px rgba(99,102,241,${focus * 0.25})`,
					display: 'flex',
					gap: 26,
					marginTop: 44,
					padding: '30px 32px',
					...popIn(frame, 56),
				}}
			>
				<UsageFleetMark size={62} />
				<div>
					<div
						style={{
							color: COLORS.indigo,
							fontSize: 20,
							fontWeight: 680,
							letterSpacing: '0.08em',
							textTransform: 'uppercase',
						}}
					>
						Focused
					</div>
					<div style={{ fontSize: 32, fontWeight: 650, marginTop: 8 }}>One problem, solved deeply.</div>
				</div>
			</Surface>
		</AbsoluteFill>
	)
}

export function FocusedMicroSaaS() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={90}>
				<Camera duration={90}>
					<HookScene />
				</Camera>
			</Sequence>
			<Sequence from={82} durationInFrames={94}>
				<Camera duration={94}>
					<NoBreakdownScene />
				</Camera>
			</Sequence>
			<Sequence from={168} durationInFrames={108}>
				<Camera duration={108}>
					<WholeProductScene />
				</Camera>
			</Sequence>
			<Sequence from={268} durationInFrames={90}>
				<Camera duration={90}>
					<NotGiantScene />
				</Camera>
			</Sequence>
			<Sequence from={350} durationInFrames={100}>
				<Camera duration={100}>
					<EndCard
						kicker='Start with one machine'
						question='You tell me.'
						title='Focused enough, or too narrow?'
					/>
				</Camera>
			</Sequence>

			{/* Voiceover + captions — one clip per scene, absolute frame positions. */}
			<VoiceOver
				clips={[
					{ at: 6, src: 'vo/v5-s1.wav', text: "A micro-SaaS doesn't need a huge idea." },
					{ at: 84, src: 'vo/v5-s2.wav', text: 'It needs a recurring irritation. Like this one.' },
					{
						at: 170,
						src: 'vo/v5-s3.wav',
						text: "Collector. Attribution. Dashboard. That's the whole product.",
					},
					{ at: 278, src: 'vo/v5-s4.wav', text: 'Not another giant AI platform. On purpose.' },
					{ at: 364, src: 'vo/v5-s5.wav', text: 'Focused enough, or too narrow? You tell me.' },
				]}
			/>

			{/* Impact flashes ride the hit and the deletion beats. */}
			<Impact at={8} color='rgba(99,102,241,0.22)' />
			<Impact at={308} color='rgba(99,102,241,0.16)' />
			<ProgressBar />

			{/* Music bed under everything; SFX punch through it. */}
			<Sound src='sfx/music.wav' volume={0.32} />
			<Sound at={8} src='sfx/hit.wav' volume={1} />
			<Sound at={82} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={100} src='sfx/pop.wav' volume={0.4} />
			<Sound at={168} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={178} src='sfx/pop.wav' volume={0.5} />
			<Sound at={190} src='sfx/pop.wav' volume={0.5} />
			<Sound at={202} src='sfx/pop.wav' volume={0.5} />
			<Sound at={268} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={284} src='sfx/pop.wav' volume={0.4} />
			<Sound at={292} src='sfx/pop.wav' volume={0.4} />
			<Sound at={300} src='sfx/pop.wav' volume={0.4} />
			<Sound at={308} src='sfx/pop.wav' volume={0.4} />
			<Sound at={350} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={372} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-5.mp4' />
		</VideoCanvas>
	)
}
