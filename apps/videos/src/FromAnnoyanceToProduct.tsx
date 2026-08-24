import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion'
import {
	COLORS,
	countTo,
	DeviceIcon,
	DeviceRow,
	EndCard,
	firstSceneOpacity,
	Meter,
	Pill,
	progress,
	rise,
	sceneOpacity,
	Surface,
	TerminalCard,
	UsageFleetMark,
	VideoCanvas,
	clamp,
} from './CampaignKit'

function ProblemScene() {
	const frame = useCurrentFrame()
	const duration = 156
	const meter = progress(frame, 34, 38)

	return (
		<AbsoluteFill
			style={{
				opacity: firstSceneOpacity(frame, duration, 16),
				padding: '150px 72px 150px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Build in public</Pill>
			<div
				style={{
					...rise(frame, -8),
					fontSize: 88,
					fontWeight: 670,
					letterSpacing: '-0.058em',
					lineHeight: 1.01,
					marginTop: 86,
					maxWidth: 920,
					textWrap: 'balance',
				}}
			>
				Tiny product.
				<br />
				Very specific annoyance.
			</div>

			<div
				style={{
					alignItems: 'center',
					display: 'grid',
					gap: 26,
					gridTemplateColumns: '1fr 1fr 1fr',
					marginTop: 112,
				}}
			>
				{[
					{ color: COLORS.indigo, kind: 'laptop' as const, name: 'MacBook' },
					{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Studio' },
					{ color: COLORS.amber, kind: 'server' as const, name: 'Server' },
				].map((device, index) => {
					const appear = progress(frame, 8 + index * 6, 18)
					return (
						<Surface
							key={device.name}
							color={device.color}
							style={{
								alignItems: 'center',
								display: 'flex',
								flexDirection: 'column',
								opacity: appear,
								padding: '31px 20px 27px',
								transform: `translate3d(0, ${(1 - appear) * 32}px, 0)`,
							}}
						>
							<div style={{ color: device.color }}>
								<DeviceIcon kind={device.kind} size={54} />
							</div>
							<div style={{ fontSize: 24, fontWeight: 610, marginTop: 17 }}>{device.name}</div>
						</Surface>
					)
				})}
			</div>

			<div
				style={{
					height: 88,
					margin: '0 auto',
					opacity: progress(frame, 24, 18),
					position: 'relative',
					width: 2,
				}}
			>
				<div
					style={{
						background: 'linear-gradient(to bottom, rgba(255,255,255,0.28), rgba(255,255,255,0.05))',
						height: '100%',
						transform: `scaleY(${meter})`,
						transformOrigin: 'top',
						width: '100%',
					}}
				/>
			</div>

			<Surface
				style={{
					opacity: progress(frame, 28, 18),
					padding: '32px 34px',
					transform: `scale(${0.97 + progress(frame, 28, 18) * 0.03})`,
				}}
			>
				<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
					<div>
						<div style={{ color: COLORS.muted, fontSize: 21 }}>One Claude subscription</div>
						<div style={{ fontSize: 30, fontWeight: 610, marginTop: 8 }}>Account usage</div>
					</div>
					<div
						style={{
							fontSize: 72,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 700,
							letterSpacing: '-0.06em',
						}}
					>
						{countTo(frame, 41, 34, 38)}%
					</div>
				</div>
				<div style={{ marginTop: 22 }}>
					<Meter delay={34} frame={frame} value={41} />
				</div>
			</Surface>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 31,
					lineHeight: 1.4,
					marginTop: 42,
					opacity: progress(frame, 82, 18),
					textAlign: 'center',
				}}
			>
				Useful total. Missing source.
			</div>
		</AbsoluteFill>
	)
}

function CollectorMilestoneScene() {
	const frame = useCurrentFrame()
	const duration = 162

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '150px 72px 150px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Built the smallest useful collector</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 78,
					fontWeight: 660,
					letterSpacing: '-0.055em',
					lineHeight: 1.02,
					marginTop: 86,
					maxWidth: 900,
				}}
			>
				Zero runtime
				<br />
				dependencies.
			</div>
			<div style={{ color: COLORS.muted, fontSize: 29, lineHeight: 1.45, marginTop: 28, maxWidth: 850 }}>
				Tail the local usage records, upload counters, remember the offset.
			</div>

			<div style={{ marginTop: 82 }}>
				<TerminalCard
					color={COLORS.indigo}
					delay={12}
					frame={frame}
					lines={['usagefleet watch', '3 files · 42 records', 'uploaded 42 · offset saved']}
					name='collector'
				/>
			</div>

			<div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr', marginTop: 32 }}>
				{[
					['Read-only tailing', COLORS.indigo],
					['At-least-once upload', COLORS.emerald],
					['Runs at login', COLORS.amber],
					['Updates itself', COLORS.violet],
				].map(([label, color], index) => {
					const appear = progress(frame, 34 + index * 5, 16)
					return (
						<Surface
							key={label}
							color={color}
							style={{
								fontSize: 24,
								fontWeight: 610,
								opacity: appear,
								padding: '22px 24px',
								transform: `translate3d(0, ${(1 - appear) * 20}px, 0)`,
							}}
						>
							<span style={{ color }}>●</span> {label}
						</Surface>
					)
				})}
			</div>
		</AbsoluteFill>
	)
}

function FirstSplitScene() {
	const frame = useCurrentFrame()
	const duration = 162
	const split = progress(frame, 28, 36)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '150px 72px 150px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>The first useful result</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 86,
					fontWeight: 670,
					letterSpacing: '-0.058em',
					lineHeight: 1.01,
					marginTop: 88,
				}}
			>
				The total finally
				<br />
				had a source.
			</div>

			<Surface
				style={{
					marginTop: 90,
					opacity: progress(frame, 12, 18),
					padding: '34px 34px',
				}}
			>
				<div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
					<div>
						<div style={{ color: COLORS.muted, fontSize: 21 }}>Window activity</div>
						<div style={{ fontSize: 31, fontWeight: 620, marginTop: 8 }}>Observed by machine</div>
					</div>
					<div style={{ color: COLORS.muted, fontSize: 22 }}>100%</div>
				</div>
				<div
					style={{
						background: 'rgba(255,255,255,0.09)',
						borderRadius: 999,
						display: 'flex',
						height: 28,
						marginTop: 32,
						overflow: 'hidden',
						transform: `scaleX(${split})`,
						transformOrigin: 'left',
					}}
				>
					<div style={{ background: COLORS.indigo, height: '100%', width: '32%' }} />
					<div style={{ background: COLORS.emerald, height: '100%', width: '51%' }} />
					<div style={{ background: COLORS.amber, height: '100%', width: '17%' }} />
				</div>
				<div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 30 }}>
					{[
						['MacBook', '32%', COLORS.indigo],
						['Studio', '51%', COLORS.emerald],
						['Server', '17%', COLORS.amber],
					].map(([name, value, color], index) => (
						<div key={name} style={{ opacity: progress(frame, 45 + index * 5, 14) }}>
							<div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
								<span style={{ background: color, borderRadius: 999, height: 11, width: 11 }} />
								<span style={{ color: COLORS.muted, fontSize: 20 }}>{name}</span>
							</div>
							<div
								style={{
									fontSize: 43,
									fontVariantNumeric: 'tabular-nums',
									fontWeight: 680,
									marginTop: 12,
								}}
							>
								{value}
							</div>
						</div>
					))}
				</div>
			</Surface>

			<div
				style={{
					background: 'rgba(16,185,129,0.1)',
					border: '1px solid rgba(16,185,129,0.28)',
					borderRadius: 26,
					color: COLORS.emerald,
					fontSize: 28,
					fontWeight: 620,
					lineHeight: 1.4,
					marginTop: 42,
					opacity: progress(frame, 68, 16),
					padding: '25px 28px',
				}}
			>
				That was the moment UsageFleet became useful.
			</div>
		</AbsoluteFill>
	)
}

function BeforeAfterScene() {
	const frame = useCurrentFrame()
	const duration = 162
	const divider = progress(frame, 20, 30)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 56px 145px',
			}}
		>
			<div style={{ ...rise(frame), fontSize: 72, fontWeight: 660, letterSpacing: '-0.052em', lineHeight: 1.03 }}>
				Same account.
				<br />
				Completely different answer.
			</div>

			<div style={{ display: 'grid', gap: 24, gridTemplateColumns: '1fr 1fr', marginTop: 86 }}>
				<Surface
					style={{
						minHeight: 1010,
						opacity: progress(frame, 8, 18),
						padding: '32px 28px',
					}}
				>
					<div
						style={{
							color: COLORS.muted,
							fontSize: 21,
							letterSpacing: '0.08em',
							textTransform: 'uppercase',
						}}
					>
						Before
					</div>
					<div
						style={{
							fontSize: 126,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 720,
							letterSpacing: '-0.08em',
							marginTop: 140,
							textAlign: 'center',
						}}
					>
						41%
					</div>
					<div style={{ marginTop: 32 }}>
						<Meter delay={12} frame={frame} value={41} />
					</div>
					<div
						style={{
							color: COLORS.muted,
							fontSize: 24,
							lineHeight: 1.45,
							marginTop: 52,
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
							transform: `scaleY(${divider})`,
							transformOrigin: 'center',
							width: 2,
						}}
					/>
					<Surface
						color={COLORS.indigo}
						style={{
							minHeight: 1010,
							opacity: progress(frame, 18, 18),
							padding: '32px 28px',
						}}
					>
						<div
							style={{
								color: COLORS.indigo,
								fontSize: 21,
								letterSpacing: '0.08em',
								textTransform: 'uppercase',
							}}
						>
							After
						</div>
						<div style={{ display: 'grid', gap: 18, marginTop: 86 }}>
							<DeviceRow
								color={COLORS.indigo}
								delay={34}
								frame={frame}
								kind='laptop'
								label='MacBook'
								value={32}
							/>
							<DeviceRow
								color={COLORS.emerald}
								delay={40}
								frame={frame}
								kind='desktop'
								label='Studio'
								value={51}
							/>
							<DeviceRow
								color={COLORS.amber}
								delay={46}
								frame={frame}
								kind='server'
								label='Server'
								value={17}
							/>
						</div>
						<div
							style={{
								color: COLORS.muted,
								fontSize: 23,
								lineHeight: 1.45,
								marginTop: 45,
								textAlign: 'center',
							}}
						>
							Where the observed
							<br />
							activity came from.
						</div>
					</Surface>
				</div>
			</div>
		</AbsoluteFill>
	)
}

function ScopeCard({ delay, frame, label }: { delay: number; frame: number; label: string }) {
	const appear = progress(frame, 8, 16)
	const remove = progress(frame, delay, 16)

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
				transform: `translate3d(${remove * 80}px, ${(1 - appear) * 24}px, 0)`,
			}}
		>
			<span>{label}</span>
			<span style={{ color: COLORS.red, fontSize: 34 }}>×</span>
		</Surface>
	)
}

function ScopeScene() {
	const frame = useCurrentFrame()
	const duration = 150
	const core = progress(frame, 72, 20)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 72px 145px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>The harder product decision</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 73,
					fontWeight: 660,
					letterSpacing: '-0.052em',
					lineHeight: 1.03,
					marginTop: 80,
				}}
			>
				Keep deleting
				<br />
				everything else.
			</div>

			<div style={{ display: 'grid', gap: 16, marginTop: 70, position: 'relative' }}>
				<ScopeCard delay={30} frame={frame} label='AI chat' />
				<ScopeCard delay={41} frame={frame} label='Prompt scoring' />
				<ScopeCard delay={52} frame={frame} label='Model router' />
				<ScopeCard delay={63} frame={frame} label='Giant reports' />

				<Surface
					color={COLORS.indigo}
					style={{
						alignItems: 'center',
						display: 'flex',
						gap: 24,
						inset: 0,
						justifyContent: 'center',
						opacity: core,
						padding: '36px 30px',
						position: 'absolute',
						transform: `scale(${0.95 + core * 0.05})`,
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
					lineHeight: 1.45,
					marginTop: 44,
					opacity: progress(frame, 84, 16),
					textAlign: 'center',
				}}
			>
				Focus is the feature.
			</div>
		</AbsoluteFill>
	)
}

function BuildEndScene() {
	return (
		<EndCard
			kicker='Collector → attribution → dashboard'
			question='Building UsageFleet in public.'
			title={
				<>
					Still one job:
					<br />
					show where the window went.
				</>
			}
		/>
	)
}

export function FromAnnoyanceToProduct() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={156}>
				<ProblemScene />
			</Sequence>
			<Sequence from={138} durationInFrames={162}>
				<CollectorMilestoneScene />
			</Sequence>
			<Sequence from={282} durationInFrames={162}>
				<FirstSplitScene />
			</Sequence>
			<Sequence from={426} durationInFrames={162}>
				<BeforeAfterScene />
			</Sequence>
			<Sequence from={570} durationInFrames={150}>
				<ScopeScene />
			</Sequence>
			<Sequence from={702} durationInFrames={138}>
				<BuildEndScene />
			</Sequence>
		</VideoCanvas>
	)
}
