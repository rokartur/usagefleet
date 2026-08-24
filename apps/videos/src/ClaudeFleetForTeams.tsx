import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion'
import {
	CheckRow,
	COLORS,
	countTo,
	DeviceIcon,
	EndCard,
	firstSceneOpacity,
	Meter,
	Pill,
	progress,
	rise,
	sceneOpacity,
	Surface,
	VideoCanvas,
	clamp,
} from './CampaignKit'

const FLEET = [
	{ account: 'A', color: COLORS.indigo, kind: 'laptop' as const, name: 'Product laptop' },
	{ account: 'A', color: COLORS.indigo, kind: 'desktop' as const, name: 'Product desktop' },
	{ account: 'B', color: COLORS.emerald, kind: 'laptop' as const, name: 'Research laptop' },
	{ account: 'B', color: COLORS.emerald, kind: 'server' as const, name: 'Research server' },
	{ account: 'B', color: COLORS.amber, kind: 'server' as const, name: 'Automation box' },
	{ account: 'A', color: COLORS.violet, kind: 'desktop' as const, name: 'Design workstation' },
]

function FleetNode({
	account,
	color,
	delay,
	frame,
	kind,
	name,
}: (typeof FLEET)[number] & { delay: number; frame: number }) {
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			color={color}
			style={{
				alignItems: 'center',
				display: 'grid',
				gap: 15,
				gridTemplateColumns: '48px 1fr 38px',
				opacity: appear,
				padding: '21px 22px',
				transform: `translate3d(0, ${(1 - appear) * 28}px, 0)`,
			}}
		>
			<div style={{ color }}>
				<DeviceIcon kind={kind} size={42} />
			</div>
			<div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.25 }}>{name}</div>
			<div
				style={{
					alignItems: 'center',
					background: `${color}20`,
					border: `1px solid ${color}52`,
					borderRadius: 999,
					color,
					display: 'flex',
					fontSize: 18,
					fontWeight: 720,
					height: 34,
					justifyContent: 'center',
					width: 34,
				}}
			>
				{account}
			</div>
		</Surface>
	)
}

function FleetScene() {
	const frame = useCurrentFrame()
	const duration = 156

	return (
		<AbsoluteFill
			style={{
				opacity: firstSceneOpacity(frame, duration, 16),
				padding: '145px 62px 145px',
			}}
		>
			<Pill style={{ marginLeft: 10, width: 'fit-content' }}>Tech founders · operational view</Pill>
			<div
				style={{
					...rise(frame, -8),
					fontSize: 79,
					fontWeight: 670,
					letterSpacing: '-0.056em',
					lineHeight: 1.02,
					margin: '82px 10px 0',
					maxWidth: 940,
					textWrap: 'balance',
				}}
			>
				Claude across a fleet
				<br />
				creates multiple budgets.
			</div>
			<div style={{ color: COLORS.muted, fontSize: 29, lineHeight: 1.42, margin: '26px 10px 0', maxWidth: 860 }}>
				Laptops, workstations, and servers — often on different subscriptions.
			</div>

			<div style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr', marginTop: 78 }}>
				{FLEET.map((device, index) => (
					<FleetNode key={device.name} {...device} delay={12 + index * 5} frame={frame} />
				))}
			</div>

			<div
				style={{
					alignItems: 'center',
					display: 'flex',
					gap: 18,
					justifyContent: 'center',
					marginTop: 46,
					opacity: progress(frame, 58, 18),
				}}
			>
				<div
					style={{
						background: 'rgba(99,102,241,0.14)',
						border: '1px solid rgba(99,102,241,0.42)',
						borderRadius: 999,
						color: COLORS.indigo,
						fontSize: 24,
						fontWeight: 650,
						padding: '16px 24px',
					}}
				>
					Account A · 41%
				</div>
				<div
					style={{
						background: 'rgba(16,185,129,0.14)',
						border: '1px solid rgba(16,185,129,0.42)',
						borderRadius: 999,
						color: COLORS.emerald,
						fontSize: 24,
						fontWeight: 650,
						padding: '16px 24px',
					}}
				>
					Account B · 63%
				</div>
			</div>
		</AbsoluteFill>
	)
}

function AccountRow({
	color,
	delay,
	frame,
	groups,
	label,
	monthly,
	value,
}: {
	color: string
	delay: number
	frame: number
	groups: { color: string; label: string; value: number }[]
	label: string
	monthly: string
	value: number
}) {
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			color={color}
			style={{
				opacity: appear,
				padding: '28px 30px',
				transform: `translate3d(0, ${(1 - appear) * 30}px, 0)`,
			}}
		>
			<div style={{ alignItems: 'start', display: 'grid', gap: 20, gridTemplateColumns: '1fr 170px' }}>
				<div>
					<div style={{ fontSize: 31, fontWeight: 640 }}>{label}</div>
					<div style={{ color: COLORS.muted, fontSize: 20, marginTop: 7 }}>
						{monthly} estimated this month
					</div>
				</div>
				<div>
					<div
						style={{
							color,
							fontSize: 48,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 690,
							textAlign: 'right',
						}}
					>
						{countTo(frame, value, delay + 4, 24)}%
					</div>
					<div style={{ marginTop: 12 }}>
						<Meter color={color} delay={delay + 4} frame={frame} value={value} />
					</div>
				</div>
			</div>
			<div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 27, paddingTop: 22 }}>
				{groups.map((group, index) => (
					<div
						key={group.label}
						style={{
							alignItems: 'center',
							display: 'grid',
							gap: 18,
							gridTemplateColumns: '1fr 120px',
							marginTop: index ? 18 : 0,
							opacity: progress(frame, delay + 18 + index * 5, 14),
						}}
					>
						<div style={{ alignItems: 'center', display: 'flex', fontSize: 23, gap: 12 }}>
							<span style={{ background: group.color, borderRadius: 999, height: 11, width: 11 }} />
							{group.label}
						</div>
						<div
							style={{
								fontSize: 24,
								fontVariantNumeric: 'tabular-nums',
								fontWeight: 620,
								textAlign: 'right',
							}}
						>
							{group.value}% budget
						</div>
					</div>
				))}
			</div>
		</Surface>
	)
}

function AccountsScene() {
	const frame = useCurrentFrame()
	const duration = 180

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 72px 145px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Every subscription stays separate</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 78,
					fontWeight: 660,
					letterSpacing: '-0.055em',
					lineHeight: 1.02,
					marginTop: 82,
				}}
			>
				Never merge
				<br />
				unrelated limits.
			</div>
			<div style={{ color: COLORS.muted, fontSize: 28, lineHeight: 1.42, marginTop: 26, maxWidth: 880 }}>
				Anthropic meters each subscription independently. The dashboard does too.
			</div>

			<div style={{ display: 'grid', gap: 22, marginTop: 68 }}>
				<AccountRow
					color={COLORS.indigo}
					delay={14}
					frame={frame}
					groups={[
						{ color: COLORS.indigo, label: 'Product laptops', value: 78 },
						{ color: COLORS.violet, label: 'Design workstations', value: 34 },
					]}
					label='Work subscription'
					monthly='$42.18'
					value={41}
				/>
				<AccountRow
					color={COLORS.emerald}
					delay={28}
					frame={frame}
					groups={[
						{ color: COLORS.emerald, label: 'Research', value: 92 },
						{ color: COLORS.amber, label: 'Automation', value: 51 },
					]}
					label='Research subscription'
					monthly='$71.06'
					value={63}
				/>
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 24,
					marginTop: 34,
					opacity: progress(frame, 64, 16),
					textAlign: 'center',
				}}
			>
				One fleet view. Independent account budgets.
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
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			color={color}
			style={{
				alignItems: 'center',
				display: 'grid',
				gap: 22,
				gridTemplateColumns: '110px 1fr',
				opacity: appear,
				padding: '25px 27px',
				transform: `translate3d(0, ${(1 - appear) * 28}px, 0)`,
			}}
		>
			<div
				style={{
					color,
					fontSize: 44,
					fontVariantNumeric: 'tabular-nums',
					fontWeight: 700,
					textAlign: 'center',
				}}
			>
				{value}
			</div>
			<div>
				<div style={{ fontSize: 28, fontWeight: 630 }}>{label}</div>
				<div style={{ color: COLORS.muted, fontSize: 20, lineHeight: 1.35, marginTop: 7 }}>{subtitle}</div>
			</div>
		</Surface>
	)
}

function GuardScene() {
	const frame = useCurrentFrame()
	const duration = 180
	const path = progress(frame, 20, 65)
	const offline = progress(frame, 94, 18)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 72px 145px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Operational controls</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 75,
					fontWeight: 660,
					letterSpacing: '-0.053em',
					lineHeight: 1.03,
					marginTop: 78,
				}}
			>
				Alert early.
				<br />
				Guard only when enabled.
			</div>

			<div style={{ marginTop: 72, paddingLeft: 28, position: 'relative' }}>
				<div
					style={{
						background: 'linear-gradient(to bottom, #f59e0b, #ff5b57, #10b981)',
						height: 650,
						left: 0,
						position: 'absolute',
						top: 30,
						transform: `scaleY(${path})`,
						transformOrigin: 'top',
						width: 3,
					}}
				/>
				<div style={{ display: 'grid', gap: 20 }}>
					<ThresholdCard
						color={COLORS.amber}
						delay={22}
						frame={frame}
						label='Desktop alert'
						subtitle='First crossing of the window threshold.'
						value='80%'
					/>
					<ThresholdCard
						color={COLORS.red}
						delay={42}
						frame={frame}
						label='Second alert'
						subtitle='A final warning before the slice is gone.'
						value='95%'
					/>
					<ThresholdCard
						color={COLORS.red}
						delay={62}
						frame={frame}
						label='Prompt guard'
						subtitle='Blocks only on explicit, fresh blocked: true.'
						value='100%'
					/>
					<ThresholdCard
						color={COLORS.emerald}
						delay={98}
						frame={frame}
						label='Tracker offline'
						subtitle='Fails open. Work continues.'
						value={offline > 0.4 ? 'PASS' : '…'}
					/>
				</div>
			</div>
		</AbsoluteFill>
	)
}

function SecurityScene() {
	const frame = useCurrentFrame()
	const duration = 156
	const hash = progress(frame, 28, 28)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 72px 145px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Trust boundary</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 78,
					fontWeight: 660,
					letterSpacing: '-0.055em',
					lineHeight: 1.02,
					marginTop: 80,
				}}
			>
				Operational visibility
				<br />
				without the conversations.
			</div>

			<div style={{ display: 'grid', gap: 17, marginTop: 70 }}>
				<CheckRow delay={14} frame={frame}>
					No prompts or responses
				</CheckRow>
				<CheckRow delay={20} frame={frame}>
					No source files
				</CheckRow>
				<CheckRow delay={26} frame={frame}>
					No Claude credentials uploaded
				</CheckRow>
			</div>

			<Surface
				color={COLORS.indigo}
				style={{
					marginTop: 46,
					opacity: hash,
					padding: '28px 30px',
					transform: `translate3d(0, ${(1 - hash) * 28}px, 0)`,
				}}
			>
				<div style={{ color: COLORS.muted, fontSize: 20 }}>Device token stored server-side as</div>
				<div
					style={{
						color: COLORS.indigo,
						fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
						fontSize: 27,
						fontWeight: 650,
						letterSpacing: '0.06em',
						marginTop: 18,
						overflow: 'hidden',
						whiteSpace: 'nowrap',
						width: `${hash * 100}%`,
					}}
				>
					SHA-256 · 8d4f••••••••••••••••••••
				</div>
				<div style={{ color: COLORS.muted, fontSize: 21, lineHeight: 1.4, marginTop: 20 }}>
					The raw token is shown once, then never stored.
				</div>
			</Surface>
		</AbsoluteFill>
	)
}

function TeamEndScene() {
	const frame = useCurrentFrame()
	const duration = 180
	const emphasis = interpolate(frame, [0, 22], [0.45, 1], clamp)

	return (
		<div style={{ opacity: emphasis }}>
			<EndCard
				kicker='Per account · per group · across every reporting machine'
				title={
					<>
						Built for teams using
						<br />
						Claude Code way too much.
					</>
				}
			/>
		</div>
	)
}

export function ClaudeFleetForTeams() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={156}>
				<FleetScene />
			</Sequence>
			<Sequence from={138} durationInFrames={180}>
				<AccountsScene />
			</Sequence>
			<Sequence from={300} durationInFrames={180}>
				<GuardScene />
			</Sequence>
			<Sequence from={462} durationInFrames={156}>
				<SecurityScene />
			</Sequence>
			<Sequence from={600} durationInFrames={180}>
				<TeamEndScene />
			</Sequence>
		</VideoCanvas>
	)
}
