import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion'
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
	rise,
	sceneOpacity,
	shake,
	Sound,
	Surface,
	VideoCanvas,
	VoiceOver,
	clamp,
} from './CampaignKit'

// Bottom bias keeps the optical centre above TikTok's caption/action overlay.
const SCENE_PADDING = '90px 72px 640px'

const SETUP = [
	{ color: COLORS.indigo, kind: 'laptop' as const, name: 'MacBook' },
	{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Mac Studio' },
	{ color: COLORS.amber, kind: 'server' as const, name: 'Server' },
]

function HookScene() {
	const frame = useCurrentFrame()
	const duration = 90
	// Meter rises in uneven steps — each machine's activity lands separately.
	const total = Math.round(interpolate(frame, [16, 22, 28, 34, 40, 46], [0, 12, 12, 29, 29, 41], { ...clamp }))
	const kick = shake(frame, 40)
	// Number swells on the final jump so the eye lands where the hit lands.
	const swell = 1 + interpolate(frame, [40, 44, 54], [0, 0.16, 0], clamp)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<div style={{ ...rise(frame, -10) }}>
				<Pill style={{ width: 'fit-content' }}>Claude Code Community</Pill>
			</div>

			{/* Negative delay: words are mid-flight on frame 0 so the hook reads instantly. */}
			<KineticTitle
				accentColor={COLORS.indigo}
				accentWords={['question']}
				delay={-6}
				lines={['I had one', 'unanswered question']}
				style={{ marginTop: 70, maxWidth: 920 }}
			/>

			<div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 84 }}>
				{SETUP.map((device, index) => (
					<Surface
						key={device.name}
						color={device.color}
						style={{
							alignItems: 'center',
							display: 'flex',
							flexDirection: 'column',
							padding: '28px 18px 24px',
							...popIn(frame, 6 + index * 4),
						}}
					>
						<div style={{ color: device.color }}>
							<DeviceIcon kind={device.kind} size={50} />
						</div>
						<div style={{ fontSize: 24, fontWeight: 610, marginTop: 15 }}>{device.name}</div>
					</Surface>
				))}
			</div>

			<Surface style={{ marginTop: 34, padding: '28px 30px', ...popIn(frame, 12) }}>
				<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
					<div style={{ color: COLORS.muted, fontSize: 23 }}>Anthropic account · 5-hour window</div>
					<div
						style={{
							fontSize: 68,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 700,
							letterSpacing: '-0.055em',
							transform: `scale(${swell})`,
							transformOrigin: 'right center',
						}}
					>
						{total}%
					</div>
				</div>
				<div
					style={{
						background: 'rgba(255,255,255,0.1)',
						borderRadius: 999,
						height: 16,
						marginTop: 22,
					}}
				>
					<div
						style={{
							background: COLORS.text,
							borderRadius: 999,
							boxShadow: '0 0 22px rgba(248,248,248,0.4)',
							height: '100%',
							transform: `scaleX(${total / 100})`,
							transformOrigin: 'left',
						}}
					/>
				</div>
			</Surface>
		</AbsoluteFill>
	)
}

function GuessCard({ color, frame, index, kind, name }: (typeof SETUP)[number] & { frame: number; index: number }) {
	const stamp = pop(frame, 18 + index * 16, 240)
	const stamped = frame >= 18 + index * 16

	return (
		<Surface
			color={stamped ? COLORS.red : color}
			style={{
				alignItems: 'center',
				display: 'grid',
				gridTemplateColumns: '64px 1fr 72px',
				padding: '28px 28px',
				...popIn(frame, 4 + index * 4),
			}}
		>
			<div style={{ color }}>
				<DeviceIcon kind={kind} size={50} />
			</div>
			<div>
				<div style={{ fontSize: 31, fontWeight: 620 }}>{name}?</div>
				<div style={{ color: COLORS.muted, fontSize: 20, marginTop: 7 }}>
					{stamped ? 'no idea' : 'maybe this one'}
				</div>
			</div>
			<div
				style={{
					alignItems: 'center',
					background: stamped ? 'rgba(255,91,87,0.14)' : 'rgba(255,255,255,0.05)',
					border: `1px solid ${stamped ? 'rgba(255,91,87,0.45)' : COLORS.border}`,
					borderRadius: 999,
					boxShadow: stamped ? '0 0 26px rgba(255,91,87,0.35)' : undefined,
					color: stamped ? COLORS.red : COLORS.muted,
					display: 'flex',
					fontSize: 36,
					fontWeight: 750,
					height: 60,
					justifyContent: 'center',
					// Stamp slams in oversized and settles — rubber-stamp weight.
					transform: `scale(${stamped ? 1.7 - stamp * 0.7 : 1}) rotate(${stamped ? (1 - stamp) * -14 : 0}deg)`,
					width: 60,
				}}
			>
				{stamped ? '×' : '?'}
			</div>
		</Surface>
	)
}

function GuessingScene() {
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
				accentWords={['limit?']}
				lines={['Which machine', 'moved my limit?']}
				size={88}
			/>
			<div style={{ color: COLORS.muted, fontSize: 29, marginTop: 26, opacity: progress(frame, 10, 12) }}>
				Every window, the same guessing game.
			</div>

			<div style={{ display: 'grid', gap: 20, marginTop: 74 }}>
				{SETUP.map((device, index) => (
					<GuessCard key={device.name} {...device} frame={frame} index={index} />
				))}
			</div>
		</AbsoluteFill>
	)
}

const TAIL_LINES = [
	{ label: 'input_tokens', pass: true, value: '482' },
	{ label: 'output_tokens', pass: true, value: '1,204' },
	{ label: 'model', pass: true, value: 'sonnet' },
	{ label: 'prompt text', pass: false, value: '██████████' },
]

function CollectorScene() {
	const frame = useCurrentFrame()
	const duration = 96

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Read-only</Pill>
			<KineticTitle
				accentColor={COLORS.emerald}
				accentWords={['read-only']}
				delay={2}
				lines={['So I built a', 'read-only collector']}
				size={82}
				style={{ marginTop: 64 }}
			/>

			<Surface style={{ marginTop: 72, overflow: 'hidden', ...popIn(frame, 6) }}>
				<div
					style={{
						alignItems: 'center',
						borderBottom: `1px solid ${COLORS.border}`,
						display: 'flex',
						gap: 10,
						padding: '16px 22px',
					}}
				>
					<span style={{ background: '#ff5f57', borderRadius: 999, height: 10, width: 10 }} />
					<span style={{ background: '#febc2e', borderRadius: 999, height: 10, width: 10 }} />
					<span style={{ background: '#28c840', borderRadius: 999, height: 10, width: 10 }} />
					<span style={{ color: COLORS.muted, fontSize: 19, marginLeft: 8 }}>usagefleet watch</span>
				</div>
				<div
					style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '24px 26px 28px' }}
				>
					{TAIL_LINES.map((line, index) => {
						const appear = pop(frame, 10 + index * 7)
						return (
							<div
								key={line.label}
								style={{
									alignItems: 'center',
									display: 'grid',
									gridTemplateColumns: '1fr 200px 130px',
									fontSize: 25,
									lineHeight: 2.1,
									opacity: Math.min(1, appear * 1.6),
									transform: `translate3d(${(1 - appear) * -22}px, 0, 0)`,
								}}
							>
								<span style={{ color: 'rgba(255,255,255,0.76)' }}>{line.label}</span>
								<span style={{ color: line.pass ? COLORS.text : 'rgba(255,255,255,0.22)' }}>
									{line.value}
								</span>
								<span
									style={{
										color: line.pass ? COLORS.emerald : COLORS.red,
										fontWeight: 650,
										textAlign: 'right',
									}}
								>
									{line.pass ? '✓ sent' : '✕ never'}
								</span>
							</div>
						)
					})}
				</div>
			</Surface>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 27,
					lineHeight: 1.45,
					marginTop: 40,
					opacity: progress(frame, 42, 14),
				}}
			>
				Counters and machine context go up. The work itself never does.
			</div>
		</AbsoluteFill>
	)
}

function DashboardScene() {
	const frame = useCurrentFrame()
	const duration = 112

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
				accentWords={['split']}
				lines={["Anthropic's number,", 'my split']}
				size={82}
			/>

			<Surface style={{ marginTop: 66, padding: '32px 34px', ...popIn(frame, 6) }}>
				<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
					<div>
						<div style={{ color: COLORS.muted, fontSize: 21 }}>Anthropic account total</div>
						<div style={{ fontSize: 29, fontWeight: 610, marginTop: 8 }}>5-hour window</div>
					</div>
					<div
						style={{
							fontSize: 84,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 700,
							letterSpacing: '-0.06em',
						}}
					>
						{countTo(frame, 41, 8, 22)}%
					</div>
				</div>
				{/* Split bar builds group by group — the product's whole point in one element. */}
				<div
					style={{
						background: 'rgba(255,255,255,0.09)',
						borderRadius: 999,
						display: 'flex',
						height: 26,
						marginTop: 28,
						overflow: 'hidden',
					}}
				>
					{[
						{ color: COLORS.indigo, delay: 18, width: 32 },
						{ color: COLORS.emerald, delay: 26, width: 51 },
						{ color: COLORS.amber, delay: 34, width: 17 },
					].map(seg => (
						<div key={seg.color} style={{ overflow: 'hidden', width: `${seg.width}%` }}>
							<div
								style={{
									background: seg.color,
									boxShadow: `0 0 20px ${seg.color}66`,
									height: '100%',
									transform: `scaleX(${progress(frame, seg.delay, 12)})`,
									transformOrigin: 'left',
									width: '100%',
								}}
							/>
						</div>
					))}
				</div>
			</Surface>

			<div style={{ display: 'grid', gap: 18, marginTop: 26 }}>
				{[
					{ color: COLORS.indigo, kind: 'laptop' as const, name: 'MacBook', value: 32 },
					{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Mac Studio', value: 51 },
					{ color: COLORS.amber, kind: 'server' as const, name: 'Server', value: 17 },
				].map((group, index) => (
					<Surface
						key={group.name}
						color={group.color}
						style={{
							alignItems: 'center',
							display: 'grid',
							gap: 22,
							gridTemplateColumns: '54px 1fr 110px',
							padding: '22px 26px',
							...popIn(frame, 26 + index * 6),
						}}
					>
						<div style={{ color: group.color }}>
							<DeviceIcon kind={group.kind} size={44} />
						</div>
						<div>
							<div style={{ fontSize: 27, fontWeight: 590 }}>{group.name}</div>
							<div style={{ marginTop: 13 }}>
								<Meter
									color={group.color}
									delay={30 + index * 6}
									frame={frame}
									glow
									height={10}
									value={group.value}
								/>
							</div>
						</div>
						<div
							style={{
								fontSize: 40,
								fontVariantNumeric: 'tabular-nums',
								fontWeight: 680,
								textAlign: 'right',
							}}
						>
							{countTo(frame, group.value, 30 + index * 6, 20)}%
						</div>
					</Surface>
				))}
			</div>
		</AbsoluteFill>
	)
}

export function BuiltTheUsageView() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={90}>
				<Camera duration={90}>
					<HookScene />
				</Camera>
			</Sequence>
			<Sequence from={82} durationInFrames={94}>
				<Camera duration={94}>
					<GuessingScene />
				</Camera>
			</Sequence>
			<Sequence from={168} durationInFrames={96}>
				<Camera duration={96}>
					<CollectorScene />
				</Camera>
			</Sequence>
			<Sequence from={256} durationInFrames={100}>
				<Camera duration={100}>
					<DashboardScene />
				</Camera>
			</Sequence>
			<Sequence from={348} durationInFrames={102}>
				<Camera duration={102}>
					<EndCard
						kicker='Built in the open for Claude Code users'
						question='Tell me what&#39;s missing.'
						title='Would you run this?'
					/>
				</Camera>
			</Sequence>

			{/* Voiceover + captions — one clip per scene, absolute frame positions. */}
			<VoiceOver video='BuiltTheUsageView' />

			{/* Impact flashes ride the hit/stamp sfx. */}
			<Impact at={40} />
			<Impact at={100} color='rgba(255,91,87,0.14)' />
			<Impact at={116} color='rgba(255,91,87,0.14)' />
			<Impact at={132} color='rgba(255,91,87,0.18)' />
			<ProgressBar />

			{/* Music bed under everything; SFX punch through it. */}
			<Sound src='sfx/music.wav' volume={0.32} />
			<Sound at={40} src='sfx/hit.wav' volume={1} />
			<Sound at={82} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={100} src='sfx/pop.wav' volume={0.45} />
			<Sound at={116} src='sfx/pop.wav' volume={0.45} />
			<Sound at={132} src='sfx/pop.wav' volume={0.45} />
			<Sound at={168} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={185} src='sfx/pop.wav' volume={0.4} />
			<Sound at={199} src='sfx/pop.wav' volume={0.4} />
			<Sound at={256} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={284} src='sfx/pop.wav' volume={0.45} />
			<Sound at={294} src='sfx/pop.wav' volume={0.45} />
			<Sound at={348} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={370} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-3.mp4' />
		</VideoCanvas>
	)
}
