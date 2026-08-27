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
	UsageFleetMark,
	VideoCanvas,
	VoiceOver,
} from './CampaignKit'

// Bottom bias keeps the optical centre above TikTok's caption/action overlay.
const SCENE_PADDING = '90px 72px 640px'

function HookScene() {
	const frame = useCurrentFrame()
	const duration = 100
	const kick = shake(frame, 8)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
				transform: `translate3d(${kick.x}px, ${kick.y}px, 0)`,
			}}
		>
			<Pill style={{ opacity: progress(frame, 0, 10), width: 'fit-content' }}>Build in public</Pill>

			{/* Negative delay: words are mid-flight on frame 0 so the hook reads instantly. */}
			<KineticTitle
				accentColor={COLORS.amber}
				accentWords={['annoyance.']}
				delay={-6}
				lines={['Tiny product.', 'Very specific annoyance.']}
				size={92}
				stagger={4}
				style={{ marginTop: 70, maxWidth: 930 }}
			/>

			<div style={{ display: 'grid', gap: 20, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 90 }}>
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
							padding: '28px 18px 24px',
							...popIn(frame, 26 + index * 4),
						}}
					>
						<div style={{ color: device.color }}>
							<DeviceIcon kind={device.kind} size={50} />
						</div>
						<div style={{ fontSize: 24, fontWeight: 610, marginTop: 15 }}>{device.name}</div>
					</Surface>
				))}
			</div>

			<Surface style={{ marginTop: 30, padding: '28px 30px', ...popIn(frame, 40) }}>
				<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
					<div style={{ color: COLORS.muted, fontSize: 23 }}>One Claude subscription · account usage</div>
					<div
						style={{
							fontSize: 64,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 700,
							letterSpacing: '-0.055em',
						}}
					>
						{countTo(frame, 41, 44, 22)}%
					</div>
				</div>
				<div style={{ marginTop: 20 }}>
					<Meter delay={44} frame={frame} glow value={41} />
				</div>
				<div style={{ color: COLORS.muted, fontSize: 24, marginTop: 20 }}>Useful total. Missing source.</div>
			</Surface>
		</AbsoluteFill>
	)
}

const LOG_ROWS = [
	{ raw: '"content": "refactor the auth…"', survives: false },
	{ counter: 'input_tokens · 482', raw: '"usage": { "input_tokens": 482 }', survives: true },
	{ counter: 'output_tokens · 1,204', raw: '"usage": { "output_tokens": 1204 }', survives: true },
	{ raw: '"text": "Here is the updated…"', survives: false },
	{ counter: 'model · sonnet', raw: '"model": "claude-sonnet-4-5"', survives: true },
]

function Day1Scene() {
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
			<Pill style={{ width: 'fit-content' }}>Day 1</Pill>
			<KineticTitle
				accentColor={COLORS.emerald}
				accentWords={['Counts,']}
				delay={2}
				lines={['Counts, not', 'conversations']}
				size={82}
				style={{ marginTop: 62 }}
			/>

			<Surface style={{ marginTop: 66, overflow: 'hidden', ...popIn(frame, 6) }}>
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
					<span style={{ color: COLORS.muted, fontSize: 19, marginLeft: 8 }}>
						collector · tailing local records
					</span>
				</div>
				<div style={{ padding: '22px 26px 26px' }}>
					{LOG_ROWS.map((row, index) => {
						const appear = progress(frame, 10 + index * 6, 10)
						const resolve = pop(frame, 18 + index * 6)
						return (
							<div
								key={row.raw}
								style={{
									alignItems: 'center',
									display: 'grid',
									gap: 20,
									gridTemplateColumns: '1fr 320px',
									opacity: appear,
									padding: '10px 0',
								}}
							>
								<span
									style={{
										color: row.survives ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.24)',
										fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
										fontSize: 21,
										overflow: 'hidden',
										textDecoration: row.survives || resolve < 0.4 ? 'none' : 'line-through',
										whiteSpace: 'nowrap',
									}}
								>
									{row.raw}
								</span>
								{row.survives ? (
									<span
										style={{
											background: 'rgba(16,185,129,0.12)',
											border: '1px solid rgba(16,185,129,0.35)',
											borderRadius: 999,
											boxShadow: `0 0 18px rgba(16,185,129,${Math.min(1, resolve) * 0.3})`,
											color: COLORS.emerald,
											fontSize: 20,
											fontWeight: 650,
											opacity: Math.min(1, resolve * 1.6),
											padding: '9px 16px',
											textAlign: 'center',
											transform: `translate3d(${(1 - resolve) * 26}px, 0, 0) scale(${0.9 + resolve * 0.1})`,
										}}
									>
										{row.counter}
									</span>
								) : (
									<span
										style={{
											color: COLORS.red,
											fontSize: 20,
											fontWeight: 650,
											opacity: Math.min(1, resolve * 1.6),
											textAlign: 'center',
										}}
									>
										✕ dropped
									</span>
								)}
							</div>
						)
					})}
				</div>
			</Surface>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 27,
					marginTop: 38,
					opacity: progress(frame, 48, 14),
				}}
			>
				Only the counters make it through the mask.
			</div>
		</AbsoluteFill>
	)
}

function Day3Scene() {
	const frame = useCurrentFrame()
	const duration = 88
	const wipe = progress(frame, 20, 18)
	const snap = progress(frame, 30, 14)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Day 3</Pill>
			<KineticTitle
				accentColor={COLORS.indigo}
				accentWords={['split']}
				delay={2}
				lines={['First useful split']}
				size={84}
				style={{ marginTop: 62 }}
			/>

			<div style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr 1fr', marginTop: 74 }}>
				<Surface style={{ minHeight: 560, padding: '30px 28px', ...popIn(frame, 6) }}>
					<div
						style={{
							color: COLORS.muted,
							fontSize: 20,
							letterSpacing: '0.08em',
							textTransform: 'uppercase',
						}}
					>
						Before
					</div>
					<div
						style={{
							fontSize: 116,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 720,
							letterSpacing: '-0.08em',
							marginTop: 96,
							textAlign: 'center',
						}}
					>
						{countTo(frame, 41, 10, 20)}%
					</div>
					<div style={{ marginTop: 28 }}>
						<Meter delay={10} frame={frame} value={41} />
					</div>
					<div
						style={{
							color: COLORS.muted,
							fontSize: 23,
							lineHeight: 1.45,
							marginTop: 44,
							textAlign: 'center',
						}}
					>
						Account used.
						<br />
						That is all.
					</div>
				</Surface>

				<div style={{ position: 'relative' }}>
					<div
						style={{
							background:
								'linear-gradient(to bottom, rgba(99,102,241,0), rgba(99,102,241,0.8), rgba(99,102,241,0))',
							height: '100%',
							left: -13,
							position: 'absolute',
							transform: `scaleY(${wipe})`,
							transformOrigin: 'center',
							width: 2,
						}}
					/>
					<Surface
						color={COLORS.indigo}
						style={{
							boxShadow: `0 0 60px rgba(99,102,241,${wipe * 0.22})`,
							minHeight: 560,
							opacity: wipe,
							padding: '30px 28px',
							transform: `translate3d(${(1 - wipe) * 40}px, 0, 0)`,
						}}
					>
						<div
							style={{
								color: COLORS.indigo,
								fontSize: 20,
								letterSpacing: '0.08em',
								textTransform: 'uppercase',
							}}
						>
							After
						</div>
						<div
							style={{
								display: 'grid',
								gap: 22,
								marginTop: 52,
								transform: `scale(${0.96 + snap * 0.04})`,
							}}
						>
							{[
								['MacBook', 32, COLORS.indigo],
								['Studio', 51, COLORS.emerald],
								['Server', 17, COLORS.amber],
							].map(([name, value, color], index) => (
								<div key={name as string} style={{ opacity: progress(frame, 32 + index * 5, 12) }}>
									<div
										style={{
											alignItems: 'center',
											display: 'flex',
											justifyContent: 'space-between',
										}}
									>
										<span style={{ fontSize: 25, fontWeight: 600 }}>{name}</span>
										<span
											style={{
												fontSize: 30,
												fontVariantNumeric: 'tabular-nums',
												fontWeight: 680,
											}}
										>
											{countTo(frame, value as number, 34 + index * 5, 18)}%
										</span>
									</div>
									<div style={{ marginTop: 12 }}>
										<Meter
											color={color as string}
											delay={34 + index * 5}
											frame={frame}
											glow
											height={10}
											value={value as number}
										/>
									</div>
								</div>
							))}
						</div>
						<div
							style={{
								color: COLORS.muted,
								fontSize: 22,
								lineHeight: 1.45,
								marginTop: 40,
								textAlign: 'center',
							}}
						>
							The total finally
							<br />
							had a source.
						</div>
					</Surface>
				</div>
			</div>
		</AbsoluteFill>
	)
}

function ScopeCard({ delay, frame, label }: { delay: number; frame: number; label: string }) {
	const appear = progress(frame, 4, 12)
	const remove = progress(frame, delay, 12)

	return (
		<Surface
			style={{
				alignItems: 'center',
				display: 'flex',
				fontSize: 27,
				fontWeight: 600,
				justifyContent: 'space-between',
				opacity: appear * (1 - remove),
				padding: '25px 28px',
				// Cut features get flicked off screen with a twist.
				transform: `translate3d(${remove * 160}px, ${(1 - appear) * 22}px, 0) rotate(${remove * 6}deg)`,
			}}
		>
			<span>{label}</span>
			<span style={{ color: COLORS.red, fontSize: 34 }}>×</span>
		</Surface>
	)
}

function ScopeScene() {
	const frame = useCurrentFrame()
	const duration = 94
	const core = pop(frame, 42)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>The harder decision</Pill>
			<KineticTitle
				accentColor={COLORS.red}
				accentWords={['not']}
				delay={2}
				lines={['The hard part:', 'not building more']}
				size={80}
				style={{ marginTop: 62 }}
			/>

			<div style={{ display: 'grid', gap: 16, marginTop: 66, position: 'relative' }}>
				<ScopeCard delay={16} frame={frame} label='AI chat' />
				<ScopeCard delay={28} frame={frame} label='Prompt analytics' />
				<ScopeCard delay={40} frame={frame} label='Giant reports' />

				<Surface
					color={COLORS.indigo}
					style={{
						alignItems: 'center',
						boxShadow: `0 0 70px rgba(99,102,241,${Math.min(1, core) * 0.28})`,
						display: 'flex',
						gap: 24,
						inset: 0,
						justifyContent: 'center',
						opacity: Math.min(1, core * 1.6),
						padding: '36px 30px',
						position: 'absolute',
						transform: `scale(${0.93 + core * 0.07})`,
					}}
				>
					<div style={{ color: COLORS.text }}>
						<UsageFleetMark size={68} />
					</div>
					<div>
						<div
							style={{
								color: COLORS.indigo,
								fontSize: 21,
								fontWeight: 680,
								letterSpacing: '0.08em',
								textTransform: 'uppercase',
							}}
						>
							One job
						</div>
						<div style={{ fontSize: 36, fontWeight: 650, letterSpacing: '-0.035em', marginTop: 9 }}>
							Show where the limit went.
						</div>
					</div>
				</Surface>
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 28,
					marginTop: 46,
					opacity: progress(frame, 54, 14),
					textAlign: 'center',
				}}
			>
				Focus is the feature.
			</div>
		</AbsoluteFill>
	)
}

export function FromAnnoyanceToProduct() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={100}>
				<Camera duration={100}>
					<HookScene />
				</Camera>
			</Sequence>
			<Sequence from={92} durationInFrames={94}>
				<Camera duration={94}>
					<Day1Scene />
				</Camera>
			</Sequence>
			<Sequence from={178} durationInFrames={88}>
				<Camera duration={88}>
					<Day3Scene />
				</Camera>
			</Sequence>
			<Sequence from={258} durationInFrames={94}>
				<Camera duration={94}>
					<ScopeScene />
				</Camera>
			</Sequence>
			<Sequence from={344} durationInFrames={106}>
				<Camera duration={106}>
					<EndCard kicker='One job: show where the limit went' title='Building in public' />
				</Camera>
			</Sequence>

			{/* Voiceover + captions — one clip per scene, absolute frame positions. */}
			<VoiceOver video='FromAnnoyanceToProduct' />

			{/* Impact flashes ride the hit, the split reveal and the core-card slam. */}
			<Impact at={8} color='rgba(245,158,11,0.18)' />
			<Impact at={202} color='rgba(99,102,241,0.18)' />
			<Impact at={300} color='rgba(99,102,241,0.16)' />
			<ProgressBar />

			{/* Music bed under everything; SFX punch through it. */}
			<Sound src='sfx/music.wav' volume={0.32} />
			<Sound at={8} src='sfx/hit.wav' volume={1} />
			<Sound at={92} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={112} src='sfx/pop.wav' volume={0.5} />
			<Sound at={124} src='sfx/pop.wav' volume={0.5} />
			<Sound at={142} src='sfx/pop.wav' volume={0.5} />
			<Sound at={178} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={202} src='sfx/pop.wav' volume={0.45} />
			<Sound at={258} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={274} src='sfx/pop.wav' volume={0.4} />
			<Sound at={286} src='sfx/pop.wav' volume={0.4} />
			<Sound at={298} src='sfx/pop.wav' volume={0.4} />
			<Sound at={344} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={366} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-4.mp4' />
		</VideoCanvas>
	)
}
