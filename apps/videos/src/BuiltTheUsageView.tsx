import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion'
import {
	COLORS,
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
	VideoCanvas,
	WindowCard,
	clamp,
} from './CampaignKit'

const SETUP = [
	{ color: COLORS.indigo, kind: 'laptop' as const, name: 'MacBook', x: 0, y: 0 },
	{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Mac Studio', x: 1, y: 0 },
	{ color: COLORS.amber, kind: 'server' as const, name: 'Server', x: 0.5, y: 1 },
]

function SetupNode({
	active,
	color,
	delay,
	frame,
	kind,
	name,
}: {
	active: number
	color: string
	delay: number
	frame: number
	kind: 'desktop' | 'laptop' | 'server'
	name: string
}) {
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			color={color}
			style={{
				alignItems: 'center',
				boxShadow: `0 24px 90px ${color}${active > 0.15 ? '38' : '14'}`,
				display: 'flex',
				gap: 18,
				opacity: appear,
				padding: '24px 26px',
				transform: `translate3d(0, ${(1 - appear) * 30}px, 0) scale(${0.98 + active * 0.02})`,
			}}
		>
			<div style={{ color }}>
				<DeviceIcon kind={kind} size={46} />
			</div>
			<div>
				<div style={{ fontSize: 26, fontWeight: 610 }}>{name}</div>
				<div style={{ color: active > 0.15 ? color : COLORS.muted, fontSize: 19, marginTop: 5 }}>
					{active > 0.15 ? 'Claude active' : 'connected'}
				</div>
			</div>
		</Surface>
	)
}

function PersonalSetupScene() {
	const frame = useCurrentFrame()
	const duration = 174
	const first = interpolate(frame, [30, 48], [0, 12], clamp)
	const second = interpolate(frame, [58, 78], [0, 17], clamp)
	const third = interpolate(frame, [88, 108], [0, 12], clamp)
	const total = Math.round(first + second + third)

	return (
		<AbsoluteFill
			style={{
				opacity: firstSceneOpacity(frame, duration, 16),
				padding: '155px 72px 150px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Claude Code Community</Pill>
			<div
				style={{
					...rise(frame, -8),
					fontSize: 76,
					fontWeight: 660,
					letterSpacing: '-0.054em',
					lineHeight: 1.03,
					marginTop: 82,
					maxWidth: 900,
					textWrap: 'balance',
				}}
			>
				I use Claude Code
				<br />
				across three machines.
			</div>

			<div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1fr 1fr', marginTop: 78 }}>
				{SETUP.slice(0, 2).map((device, index) => (
					<SetupNode
						key={device.name}
						{...device}
						active={progress(frame, 30 + index * 30, 14)}
						delay={10 + index * 6}
						frame={frame}
					/>
				))}
			</div>
			<div style={{ margin: '18px auto 0', width: '50%' }}>
				<SetupNode {...SETUP[2]} active={progress(frame, 88, 14)} delay={22} frame={frame} />
			</div>

			<Surface
				style={{
					marginTop: 68,
					opacity: progress(frame, 28, 18),
					padding: '28px 30px',
				}}
			>
				<div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between' }}>
					<div>
						<div style={{ color: COLORS.muted, fontSize: 21 }}>Anthropic account total</div>
						<div style={{ fontSize: 28, fontWeight: 590, marginTop: 7 }}>5-hour window</div>
					</div>
					<div
						style={{
							fontSize: 66,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 690,
							letterSpacing: '-0.055em',
						}}
					>
						{total}%
					</div>
				</div>
				<div style={{ marginTop: 22 }}>
					<Meter frame={frame} value={total} />
				</div>
			</Surface>

			<div
				style={{
					fontSize: 39,
					fontWeight: 610,
					letterSpacing: '-0.035em',
					marginTop: 48,
					opacity: progress(frame, 108, 18),
					textAlign: 'center',
				}}
			>
				But which machine moved it?
			</div>
		</AbsoluteFill>
	)
}

function GuessCard({
	color,
	frame,
	index,
	kind,
	name,
}: {
	color: string
	frame: number
	index: number
	kind: 'desktop' | 'laptop' | 'server'
	name: string
}) {
	const appear = progress(frame, 8 + index * 5, 16)
	const start = 24 + index * 28
	const selected = interpolate(frame, [start, start + 8, start + 20, start + 27], [0, 1, 1, 0], clamp)
	const crossed = progress(frame, start + 17, 8)

	return (
		<Surface
			color={selected > 0.1 ? color : undefined}
			style={{
				alignItems: 'center',
				display: 'grid',
				gridTemplateColumns: '64px 1fr 72px',
				opacity: appear,
				padding: '28px 28px',
				transform: `translate3d(0, ${(1 - appear) * 28}px, 0) scale(${0.98 + selected * 0.02})`,
			}}
		>
			<div style={{ color: selected > 0.1 ? color : COLORS.muted }}>
				<DeviceIcon kind={kind} size={50} />
			</div>
			<div>
				<div style={{ fontSize: 31, fontWeight: 620 }}>{name}</div>
				<div style={{ color: COLORS.muted, fontSize: 20, marginTop: 7 }}>
					{selected > 0.1 ? 'maybe this one?' : 'unknown'}
				</div>
			</div>
			<div
				style={{
					alignItems: 'center',
					background: crossed > 0.1 ? 'rgba(255,91,87,0.14)' : 'rgba(255,255,255,0.05)',
					border: `1px solid ${crossed > 0.1 ? 'rgba(255,91,87,0.45)' : COLORS.border}`,
					borderRadius: 999,
					color: crossed > 0.1 ? COLORS.red : COLORS.muted,
					display: 'flex',
					fontSize: 34,
					fontWeight: 750,
					height: 58,
					justifyContent: 'center',
					opacity: selected > 0.1 ? 1 : 0.55,
					width: 58,
				}}
			>
				{crossed > 0.1 ? '×' : '?'}
			</div>
		</Surface>
	)
}

function GuessingScene() {
	const frame = useCurrentFrame()
	const duration = 150

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '160px 72px 150px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>The old workflow</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 90,
					fontWeight: 670,
					letterSpacing: '-0.06em',
					lineHeight: 1,
					marginTop: 90,
				}}
			>
				I kept guessing.
			</div>
			<div style={{ color: COLORS.muted, fontSize: 30, marginTop: 25 }}>
				Open a laptop. Check a server. Still no answer.
			</div>

			<div style={{ display: 'grid', gap: 18, marginTop: 92 }}>
				{SETUP.map((device, index) => (
					<GuessCard key={device.name} {...device} frame={frame} index={index} />
				))}
			</div>

			<div
				style={{
					color: COLORS.red,
					fontSize: 29,
					fontWeight: 620,
					marginTop: 42,
					opacity: progress(frame, 104, 14),
					textAlign: 'center',
				}}
			>
				Guessing is not observability.
			</div>
		</AbsoluteFill>
	)
}

function DataChip({
	children,
	color,
	delay,
	frame,
}: {
	children: string
	color: string
	delay: number
	frame: number
}) {
	const appear = progress(frame, delay, 14)

	return (
		<div
			style={{
				background: `${color}18`,
				border: `1px solid ${color}58`,
				borderRadius: 999,
				color,
				fontSize: 20,
				fontWeight: 650,
				opacity: appear,
				padding: '12px 17px',
				transform: `translate3d(${(1 - appear) * -24}px, 0, 0)`,
			}}
		>
			{children}
		</div>
	)
}

function CollectorScene() {
	const frame = useCurrentFrame()
	const duration = 162
	const flow = progress(frame, 32, 44)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 60px 145px',
			}}
		>
			<Pill style={{ marginLeft: 12, width: 'fit-content' }}>So I built the missing layer</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 72,
					fontWeight: 660,
					letterSpacing: '-0.052em',
					lineHeight: 1.03,
					margin: '76px 12px 0',
					maxWidth: 910,
				}}
			>
				A read-only collector
				<br />
				for usage records.
			</div>

			<div
				style={{
					alignItems: 'stretch',
					display: 'grid',
					gap: 28,
					gridTemplateColumns: '1fr 100px 1fr',
					marginTop: 74,
				}}
			>
				<Surface style={{ minHeight: 530, opacity: progress(frame, 10, 18), padding: '28px 26px' }}>
					<div
						style={{
							color: COLORS.muted,
							fontSize: 19,
							letterSpacing: '0.08em',
							textTransform: 'uppercase',
						}}
					>
						Stays local
					</div>
					<div style={{ fontSize: 30, fontWeight: 620, marginTop: 14 }}>Claude JSONL</div>
					<div
						style={{
							color: 'rgba(255,255,255,0.68)',
							fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
							fontSize: 18,
							lineHeight: 1.7,
							marginTop: 30,
						}}
					>
						<div>usage.input_tokens</div>
						<div>usage.output_tokens</div>
						<div>model</div>
						<div>session_id</div>
						<div>cwd · branch</div>
					</div>
					<div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 30, paddingTop: 25 }}>
						{['prompts', 'responses', 'file contents'].map(item => (
							<div
								key={item}
								style={{
									alignItems: 'center',
									color: COLORS.muted,
									display: 'flex',
									fontSize: 21,
									gap: 10,
									marginTop: 12,
								}}
							>
								<span style={{ color: COLORS.emerald }}>●</span> {item}: not read
							</div>
						))}
					</div>
				</Surface>

				<div style={{ alignItems: 'center', display: 'flex', justifyContent: 'center', position: 'relative' }}>
					<div
						style={{
							background: 'linear-gradient(90deg, rgba(255,255,255,0.08), rgba(99,102,241,0.8))',
							height: 2,
							transform: `scaleX(${flow})`,
							transformOrigin: 'left',
							width: '100%',
						}}
					/>
					<div
						style={{
							borderBottom: '8px solid transparent',
							borderLeft: `12px solid ${COLORS.indigo}`,
							borderTop: '8px solid transparent',
							opacity: flow,
							position: 'absolute',
							right: -1,
						}}
					/>
				</div>

				<Surface
					color={COLORS.indigo}
					style={{
						minHeight: 530,
						opacity: progress(frame, 28, 18),
						padding: '28px 26px',
					}}
				>
					<div
						style={{
							color: COLORS.muted,
							fontSize: 19,
							letterSpacing: '0.08em',
							textTransform: 'uppercase',
						}}
					>
						Reported
					</div>
					<div style={{ fontSize: 30, fontWeight: 620, marginTop: 14 }}>UsageFleet</div>
					<div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 34 }}>
						<DataChip color={COLORS.indigo} delay={45} frame={frame}>
							token counts
						</DataChip>
						<DataChip color={COLORS.emerald} delay={50} frame={frame}>
							model
						</DataChip>
						<DataChip color={COLORS.amber} delay={55} frame={frame}>
							session
						</DataChip>
						<DataChip color={COLORS.violet} delay={60} frame={frame}>
							machine context
						</DataChip>
					</div>
					<div
						style={{
							background: 'rgba(16,185,129,0.1)',
							border: '1px solid rgba(16,185,129,0.28)',
							borderRadius: 24,
							color: COLORS.emerald,
							fontSize: 23,
							fontWeight: 620,
							lineHeight: 1.35,
							marginTop: 42,
							opacity: progress(frame, 66, 16),
							padding: '22px 22px',
						}}
					>
						Enough to attribute usage.
						<br />
						Nothing to reconstruct the work.
					</div>
				</Surface>
			</div>
		</AbsoluteFill>
	)
}

function DashboardScene() {
	const frame = useCurrentFrame()
	const duration = 180
	const camera = interpolate(frame, [0, duration], [0.96, 1.02], clamp)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '125px 52px 140px',
			}}
		>
			<Surface
				style={{
					minHeight: 1410,
					opacity: progress(frame, 0, 18),
					padding: '38px 38px',
					transform: `scale(${camera})`,
				}}
			>
				<div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
					<div style={{ fontSize: 29, fontWeight: 650 }}>The view I wanted</div>
					<div style={{ alignItems: 'center', color: COLORS.muted, display: 'flex', fontSize: 20, gap: 9 }}>
						<span style={{ background: COLORS.emerald, borderRadius: 999, height: 9, width: 9 }} />
						live
					</div>
				</div>

				<div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1fr 1fr', marginTop: 40 }}>
					<WindowCard delay={10} frame={frame} label='5-hour session' reset='resets in 2h 13m' value={41} />
					<WindowCard delay={16} frame={frame} label='Weekly' reset='resets in 3d 8h' value={44} />
				</div>

				<div
					style={{
						color: COLORS.muted,
						fontSize: 20,
						fontWeight: 650,
						letterSpacing: '0.09em',
						marginTop: 38,
						textTransform: 'uppercase',
					}}
				>
					Device activity
				</div>
				<div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
					<DeviceRow
						color={COLORS.indigo}
						delay={28}
						frame={frame}
						kind='laptop'
						label='MacBook'
						value={32}
					/>
					<DeviceRow
						color={COLORS.emerald}
						delay={34}
						frame={frame}
						kind='desktop'
						label='Mac Studio'
						value={51}
					/>
					<DeviceRow color={COLORS.amber} delay={40} frame={frame} kind='server' label='Server' value={17} />
				</div>

				<div
					style={{
						background: 'linear-gradient(90deg, rgba(99,102,241,0.16), rgba(16,185,129,0.12))',
						border: `1px solid ${COLORS.border}`,
						borderRadius: 26,
						fontSize: 26,
						fontWeight: 610,
						lineHeight: 1.4,
						marginTop: 34,
						opacity: progress(frame, 52, 16),
						padding: '25px 27px',
					}}
				>
					Official account utilization above.
					<br />
					Observed machine activity below.
				</div>
			</Surface>
		</AbsoluteFill>
	)
}

function FeedbackEndScene() {
	return (
		<EndCard
			kicker='Built in the open for heavy Claude Code users'
			question='What would you need before installing it on your machines?'
			title={
				<>
					I built the Claude
					<br />
					usage view I wanted.
				</>
			}
		/>
	)
}

export function BuiltTheUsageView() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={174}>
				<PersonalSetupScene />
			</Sequence>
			<Sequence from={156} durationInFrames={150}>
				<GuessingScene />
			</Sequence>
			<Sequence from={288} durationInFrames={162}>
				<CollectorScene />
			</Sequence>
			<Sequence from={432} durationInFrames={180}>
				<DashboardScene />
			</Sequence>
			<Sequence from={594} durationInFrames={216}>
				<FeedbackEndScene />
			</Sequence>
		</VideoCanvas>
	)
}
