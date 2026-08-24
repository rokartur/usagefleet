import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion'
import {
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
	UsageFleetMark,
	VideoCanvas,
	clamp,
} from './CampaignKit'

function TinyIdeaScene() {
	const frame = useCurrentFrame()
	const duration = 156
	const dot = progress(frame, 6, 24)
	const card = progress(frame, 40, 24)

	return (
		<AbsoluteFill
			style={{
				opacity: firstSceneOpacity(frame, duration, 16),
				padding: '150px 72px 150px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Indie makers · micro-SaaS</Pill>
			<div
				style={{
					...rise(frame, -8),
					fontSize: 82,
					fontWeight: 670,
					letterSpacing: '-0.057em',
					lineHeight: 1.02,
					marginTop: 86,
					maxWidth: 920,
					textWrap: 'balance',
				}}
			>
				A tiny SaaS can solve
				<br />
				one repeated annoyance.
			</div>

			<div style={{ height: 730, marginTop: 76, position: 'relative' }}>
				<div
					style={{
						background: COLORS.indigo,
						borderRadius: 999,
						boxShadow: '0 0 80px rgba(99,102,241,0.55)',
						height: 22,
						left: '50%',
						opacity: dot * (1 - card),
						position: 'absolute',
						top: 290,
						transform: `translateX(-50%) scale(${0.95 + dot * 0.05})`,
						width: 22,
					}}
				/>

				<Surface
					color={COLORS.indigo}
					style={{
						left: 70,
						opacity: card,
						padding: '36px 36px',
						position: 'absolute',
						right: 70,
						top: 150,
						transform: `translate3d(0, ${(1 - card) * 36}px, 0) scale(${0.95 + card * 0.05})`,
					}}
				>
					<div style={{ color: COLORS.muted, fontSize: 21 }}>The recurring irritation</div>
					<div style={{ fontSize: 40, fontWeight: 640, letterSpacing: '-0.035em', marginTop: 14 }}>
						Claude usage moved again.
					</div>
					<div
						style={{
							fontSize: 126,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 730,
							letterSpacing: '-0.08em',
							marginTop: 76,
						}}
					>
						{countTo(frame, 41, 42, 32)}%
					</div>
					<div style={{ marginTop: 28 }}>
						<Meter color={COLORS.indigo} delay={42} frame={frame} height={18} value={41} />
					</div>
					<div style={{ color: COLORS.muted, fontSize: 25, lineHeight: 1.45, marginTop: 40 }}>
						Which machine caused it?
					</div>
				</Surface>
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 29,
					opacity: progress(frame, 82, 18),
					textAlign: 'center',
				}}
			>
				Small problem. Frequent pain.
			</div>
		</AbsoluteFill>
	)
}

function RepeatedCard({
	delay,
	frame,
	label,
	offset,
}: {
	delay: number
	frame: number
	label: string
	offset: number
}) {
	const appear = progress(frame, delay, 16)

	return (
		<Surface
			style={{
				left: 0,
				opacity: appear,
				padding: '25px 27px',
				position: 'absolute',
				right: 0,
				top: offset,
				transform: `translate3d(0, ${(1 - appear) * 30}px, 0) scale(${0.97 + appear * 0.03})`,
			}}
		>
			<div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}>
				<div>
					<div style={{ color: COLORS.muted, fontSize: 19 }}>{label}</div>
					<div style={{ fontSize: 26, fontWeight: 610, marginTop: 7 }}>Account usage changed</div>
				</div>
				<div style={{ fontSize: 44, fontVariantNumeric: 'tabular-nums', fontWeight: 680 }}>41%</div>
			</div>
		</Surface>
	)
}

function RepeatedAnnoyanceScene() {
	const frame = useCurrentFrame()
	const duration = 156
	const collapse = progress(frame, 82, 24)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 72px 145px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>The same blind spot, every window</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 82,
					fontWeight: 670,
					letterSpacing: '-0.057em',
					lineHeight: 1.02,
					marginTop: 82,
				}}
			>
				One total.
				<br />
				Several machines.
			</div>

			<div style={{ height: 475, marginTop: 68, position: 'relative' }}>
				<RepeatedCard delay={12} frame={frame} label='This morning' offset={0} />
				<RepeatedCard delay={21} frame={frame} label='Later that day' offset={122} />
				<RepeatedCard delay={30} frame={frame} label='Again' offset={244} />
				<div
					style={{
						background: 'linear-gradient(to bottom, rgba(0,0,0,0), #000)',
						bottom: 0,
						height: 180,
						left: 0,
						opacity: 1 - collapse,
						position: 'absolute',
						right: 0,
					}}
				/>
			</div>

			<div
				style={{
					display: 'grid',
					gap: 18,
					gridTemplateColumns: '1fr 1fr 1fr',
					marginTop: -20,
					opacity: collapse,
					transform: `translate3d(0, ${(1 - collapse) * 34}px, 0)`,
				}}
			>
				{[
					{ color: COLORS.indigo, kind: 'laptop' as const, name: 'MacBook' },
					{ color: COLORS.emerald, kind: 'desktop' as const, name: 'Studio' },
					{ color: COLORS.amber, kind: 'server' as const, name: 'Server' },
				].map(device => (
					<Surface
						key={device.name}
						color={device.color}
						style={{
							alignItems: 'center',
							display: 'flex',
							flexDirection: 'column',
							padding: '28px 16px 25px',
						}}
					>
						<div style={{ color: device.color }}>
							<DeviceIcon kind={device.kind} size={48} />
						</div>
						<div style={{ fontSize: 23, fontWeight: 610, marginTop: 15 }}>{device.name}</div>
						<div style={{ color: COLORS.muted, fontSize: 38, fontWeight: 680, marginTop: 20 }}>?</div>
					</Surface>
				))}
			</div>

			<div
				style={{
					color: COLORS.red,
					fontSize: 32,
					fontWeight: 620,
					marginTop: 40,
					opacity: progress(frame, 105, 16),
					textAlign: 'center',
				}}
			>
				No breakdown.
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
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			color={color}
			style={{
				minHeight: 250,
				opacity: appear,
				padding: '28px 27px',
				transform: `translate3d(0, ${(1 - appear) * 30}px, 0)`,
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
			<div style={{ fontSize: 31, fontWeight: 640, marginTop: 26 }}>{label}</div>
			<div style={{ color: COLORS.muted, fontSize: 21, lineHeight: 1.4, marginTop: 12 }}>{subtitle}</div>
		</Surface>
	)
}

function ProductLoopScene() {
	const frame = useCurrentFrame()
	const duration = 168
	const lineOne = progress(frame, 30, 30)
	const lineTwo = progress(frame, 52, 30)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 62px 145px',
			}}
		>
			<Pill style={{ marginLeft: 10, width: 'fit-content' }}>That is the whole product</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 82,
					fontWeight: 670,
					letterSpacing: '-0.057em',
					lineHeight: 1.02,
					margin: '82px 10px 0',
				}}
			>
				Three steps.
				<br />
				One useful answer.
			</div>

			<div
				style={{
					display: 'grid',
					gap: 22,
					gridTemplateColumns: '1fr 1fr 1fr',
					marginTop: 92,
					position: 'relative',
				}}
			>
				<FlowStep
					color={COLORS.indigo}
					delay={12}
					frame={frame}
					label='Collect'
					number='1'
					subtitle='Tail local usage records.'
				/>
				<FlowStep
					color={COLORS.emerald}
					delay={26}
					frame={frame}
					label='Attribute'
					number='2'
					subtitle='Split each official rise.'
				/>
				<FlowStep
					color={COLORS.amber}
					delay={40}
					frame={frame}
					label='Show'
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
					marginTop: 70,
					opacity: progress(frame, 76, 18),
					padding: '30px 32px',
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

function FeatureCard({
	children,
	color,
	delay,
	frame,
	label,
}: {
	children: React.ReactNode
	color: string
	delay: number
	frame: number
	label: string
}) {
	const appear = progress(frame, delay, 18)

	return (
		<Surface
			color={color}
			style={{
				minHeight: 300,
				opacity: appear,
				padding: '28px 27px',
				transform: `translate3d(0, ${(1 - appear) * 30}px, 0)`,
			}}
		>
			<div style={{ color, fontSize: 20, fontWeight: 680, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
				{label}
			</div>
			{children}
		</Surface>
	)
}

function CoreFeaturesScene() {
	const frame = useCurrentFrame()
	const duration = 144

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 62px 145px',
			}}
		>
			<div style={{ ...rise(frame), fontSize: 80, fontWeight: 670, letterSpacing: '-0.057em', lineHeight: 1.02 }}>
				Only the things
				<br />
				that answer the question.
			</div>
			<div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1fr 1fr 1fr', marginTop: 92 }}>
				<FeatureCard color={COLORS.indigo} delay={12} frame={frame} label='Live limits'>
					<div style={{ fontSize: 82, fontVariantNumeric: 'tabular-nums', fontWeight: 690, marginTop: 48 }}>
						41%
					</div>
					<div style={{ marginTop: 22 }}>
						<Meter color={COLORS.indigo} delay={18} frame={frame} value={41} />
					</div>
					<div style={{ color: COLORS.muted, fontSize: 20, marginTop: 21 }}>5-hour + weekly</div>
				</FeatureCard>

				<FeatureCard color={COLORS.emerald} delay={20} frame={frame} label='History'>
					<div style={{ alignItems: 'end', display: 'flex', gap: 10, height: 105, marginTop: 45 }}>
						{[42, 70, 54, 92, 61].map((height, index) => (
							<div
								key={height}
								style={{
									background: COLORS.emerald,
									borderRadius: 8,
									height: `${height}%`,
									opacity: progress(frame, 30 + index * 4, 12),
									width: 23,
								}}
							/>
						))}
					</div>
					<div style={{ color: COLORS.muted, fontSize: 20, marginTop: 25 }}>by device or group</div>
				</FeatureCard>

				<FeatureCard color={COLORS.amber} delay={28} frame={frame} label='Spend'>
					<div
						style={{
							fontSize: 60,
							fontVariantNumeric: 'tabular-nums',
							fontWeight: 690,
							letterSpacing: '-0.055em',
							marginTop: 64,
						}}
					>
						$18.42
					</div>
					<div style={{ color: COLORS.muted, fontSize: 20, lineHeight: 1.4, marginTop: 22 }}>
						estimated this week
					</div>
				</FeatureCard>
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 31,
					fontWeight: 590,
					marginTop: 70,
					opacity: progress(frame, 58, 16),
					textAlign: 'center',
				}}
			>
				Live limits. History. Spend.
			</div>
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
	const appear = progress(frame, 6, 16)
	const remove = keep ? 0 : progress(frame, delay, 14)

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
				opacity: appear * (1 - remove),
				padding: '20px 23px',
				transform: `translate3d(${remove * 52}px, ${(1 - appear) * 20}px, 0)`,
			}}
		>
			<span>{label}</span>
			<span style={{ color: keep ? COLORS.indigo : COLORS.red }}>{keep ? '✓' : '×'}</span>
		</Surface>
	)
}

function NotGiantScene() {
	const frame = useCurrentFrame()
	const duration = 144
	const focus = progress(frame, 74, 18)

	return (
		<AbsoluteFill
			style={{
				opacity: sceneOpacity(frame, duration, 14),
				padding: '145px 72px 145px',
			}}
		>
			<Pill style={{ width: 'fit-content' }}>Product strategy by deletion</Pill>
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
				Not another giant
				<br />
				AI dashboard.
			</div>

			<div
				style={{
					display: 'grid',
					gap: 16,
					gridTemplateColumns: '1fr 1fr',
					marginTop: 72,
					position: 'relative',
				}}
			>
				<ModuleCard delay={24} frame={frame} label='Prompt scoring' />
				<ModuleCard delay={34} frame={frame} label='Agent chat' />
				<ModuleCard delay={44} frame={frame} label='Model routing' />
				<ModuleCard delay={54} frame={frame} label='AI marketplace' />
				<ModuleCard delay={64} frame={frame} label='Workflow builder' />
				<ModuleCard delay={74} frame={frame} keep label='Usage visibility' />
			</div>

			<Surface
				color={COLORS.indigo}
				style={{
					alignItems: 'center',
					display: 'flex',
					gap: 26,
					marginTop: 50,
					opacity: focus,
					padding: '30px 32px',
					transform: `scale(${0.95 + focus * 0.05})`,
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

function FounderEndScene() {
	return (
		<EndCard
			kicker='A deliberately narrow micro-SaaS'
			question='Focused enough — or too narrow?'
			title={
				<>
					One recurring irritation.
					<br />
					One focused product.
				</>
			}
		/>
	)
}

export function FocusedMicroSaaS() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={156}>
				<TinyIdeaScene />
			</Sequence>
			<Sequence from={138} durationInFrames={156}>
				<RepeatedAnnoyanceScene />
			</Sequence>
			<Sequence from={276} durationInFrames={168}>
				<ProductLoopScene />
			</Sequence>
			<Sequence from={426} durationInFrames={144}>
				<CoreFeaturesScene />
			</Sequence>
			<Sequence from={552} durationInFrames={144}>
				<NotGiantScene />
			</Sequence>
			<Sequence from={678} durationInFrames={132}>
				<FounderEndScene />
			</Sequence>
		</VideoCanvas>
	)
}
