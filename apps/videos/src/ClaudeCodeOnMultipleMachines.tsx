import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion'
import {
	Camera,
	COLORS,
	countTo,
	DeviceRow,
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
	TerminalCard,
	VideoCanvas,
	VoiceOver,
	WindowCard,
	clamp,
} from './CampaignKit'

// Bottom bias keeps the optical centre above TikTok's caption/action overlay.
const SCENE_PADDING = '90px 72px 640px'

const TERMINALS = [
	{
		color: COLORS.indigo,
		lines: ['claude', 'working on web app'],
		name: 'MacBook',
	},
	{
		color: COLORS.emerald,
		lines: ['claude', 'refactoring API'],
		name: 'Mac Studio',
	},
	{
		color: COLORS.amber,
		lines: ['claude -p', 'running scheduled task'],
		name: 'Server',
	},
]

function FleetHookScene() {
	const frame = useCurrentFrame()
	const duration = 98
	const total = progress(frame, 32, 16)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: firstSceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<div style={{ ...rise(frame, -10), maxWidth: 900 }}>
				<Pill style={{ width: 'fit-content' }}>
					<span style={{ background: COLORS.emerald, borderRadius: 999, height: 10, width: 10 }} />
					Everything Claude Code
				</Pill>
				<h1
					style={{
						fontSize: 88,
						fontWeight: 670,
						letterSpacing: '-0.057em',
						lineHeight: 1.01,
						margin: '92px 0 0',
						textWrap: 'balance',
					}}
				>
					Claude Code on
					<br />
					2+ machines?
				</h1>
			</div>

			<div style={{ display: 'grid', gap: 18, marginTop: 82 }}>
				{TERMINALS.map((terminal, index) => (
					<TerminalCard key={terminal.name} {...terminal} delay={6 + index * 4} frame={frame} />
				))}
			</div>

			<div
				style={{
					height: 74,
					marginLeft: 72,
					opacity: total,
					position: 'relative',
					width: 744,
				}}
			>
				<div
					style={{
						background: 'linear-gradient(to bottom, rgba(255,255,255,0.34), rgba(255,255,255,0.06))',
						height: '100%',
						left: '50%',
						position: 'absolute',
						transform: `scaleY(${total})`,
						transformOrigin: 'top',
						width: 2,
					}}
				/>
			</div>

			<Surface
				style={{
					alignItems: 'center',
					display: 'grid',
					gridTemplateColumns: '1fr auto',
					opacity: total,
					padding: '26px 30px',
					transform: `translate3d(0, ${(1 - total) * 28}px, 0) scale(${0.97 + total * 0.03})`,
				}}
			>
				<div>
					<div style={{ color: COLORS.muted, fontSize: 21 }}>Anthropic account total</div>
					<div style={{ fontSize: 28, fontWeight: 590, marginTop: 7 }}>5-hour window</div>
				</div>
				<div
					style={{
						fontSize: 62,
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 690,
						letterSpacing: '-0.055em',
					}}
				>
					{countTo(frame, 41, 34, 16)}%
				</div>
			</Surface>
		</AbsoluteFill>
	)
}

function GroupBudgetRow({
	color,
	delay,
	frame,
	label,
	value,
}: {
	color: string
	delay: number
	frame: number
	label: string
	value: number
}) {
	const appear = progress(frame, delay, 18)

	return (
		<div
			style={{
				borderBottom: `1px solid ${COLORS.border}`,
				display: 'grid',
				gap: 22,
				gridTemplateColumns: '1fr 160px',
				opacity: appear,
				padding: '27px 0',
				transform: `translate3d(0, ${(1 - appear) * 24}px, 0)`,
			}}
		>
			<div style={{ alignItems: 'center', display: 'flex', gap: 15 }}>
				<span style={{ background: color, borderRadius: 999, height: 14, width: 14 }} />
				<div>
					<div style={{ fontSize: 27, fontWeight: 590 }}>{label}</div>
					<div style={{ color: COLORS.muted, fontSize: 19, marginTop: 6 }}>group budget used</div>
				</div>
			</div>
			<div>
				<div
					style={{
						fontSize: 31,
						fontVariantNumeric: 'tabular-nums',
						fontWeight: 650,
						textAlign: 'right',
					}}
				>
					{countTo(frame, value, delay + 4, 22)}%
				</div>
				<div style={{ marginTop: 12 }}>
					<Meter color={color} delay={delay + 4} frame={frame} value={value} />
				</div>
			</div>
		</div>
	)
}

function AttributionScene() {
	const frame = useCurrentFrame()
	const duration = 118

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>One official total · useful context</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 74,
					fontWeight: 660,
					letterSpacing: '-0.052em',
					lineHeight: 1.03,
					marginTop: 80,
					maxWidth: 900,
					textWrap: 'balance',
				}}
			>
				Keep Anthropic’s number.
				<br />
				Add the missing context.
			</div>

			<div style={{ display: 'grid', gap: 18, gridTemplateColumns: '1fr 1fr', marginTop: 70 }}>
				<WindowCard delay={6} frame={frame} label='5-hour session' reset='resets in 2h 13m' value={41} />
				<WindowCard delay={10} frame={frame} label='Weekly' reset='resets in 3d 8h' value={44} />
			</div>

			<Surface style={{ marginTop: 30, padding: '18px 28px 10px' }}>
				<div
					style={{
						color: COLORS.muted,
						fontSize: 20,
						fontWeight: 650,
						letterSpacing: '0.09em',
						padding: '12px 0 6px',
						textTransform: 'uppercase',
					}}
				>
					Attributed across groups
				</div>
				<GroupBudgetRow color={COLORS.indigo} delay={18} frame={frame} label='Laptops' value={78} />
				<GroupBudgetRow color={COLORS.emerald} delay={23} frame={frame} label='Work desktops' value={34} />
				<GroupBudgetRow color={COLORS.amber} delay={28} frame={frame} label='Home server' value={9} />
			</Surface>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 21,
					lineHeight: 1.4,
					marginTop: 25,
					opacity: progress(frame, 36, 12),
				}}
			>
				Each group is measured against its own equal slice of the account limit.
			</div>
		</AbsoluteFill>
	)
}

function DeviceHistoryScene() {
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
			<div style={{ ...rise(frame), maxWidth: 900 }}>
				<Pill style={{ width: 'fit-content' }}>Usage over time · split by device</Pill>
				<div
					style={{
						fontSize: 78,
						fontWeight: 660,
						letterSpacing: '-0.055em',
						lineHeight: 1.02,
						marginTop: 86,
						textWrap: 'balance',
					}}
				>
					Need the exact
					<br />
					device activity?
				</div>
				<div style={{ color: COLORS.muted, fontSize: 29, lineHeight: 1.42, marginTop: 28 }}>
					Split raw usage and estimated cost by machine.
				</div>
			</div>

			<div style={{ display: 'grid', gap: 18, marginTop: 82 }}>
				<DeviceRow color={COLORS.indigo} delay={10} frame={frame} kind='laptop' label='MacBook' value={32} />
				<DeviceRow
					color={COLORS.emerald}
					delay={15}
					frame={frame}
					kind='desktop'
					label='Mac Studio'
					value={51}
				/>
				<DeviceRow color={COLORS.amber} delay={20} frame={frame} kind='server' label='Server' value={17} />
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 22,
					marginTop: 30,
					opacity: progress(frame, 28, 12),
					textAlign: 'center',
				}}
			>
				32% + 51% + 17% = this window’s observed activity
			</div>
		</AbsoluteFill>
	)
}

function InstallScene() {
	const frame = useCurrentFrame()
	const duration = 84
	const command = progress(frame, 6, 14)

	return (
		<AbsoluteFill
			style={{
				justifyContent: 'center',
				opacity: sceneOpacity(frame, duration, 8),
				padding: SCENE_PADDING,
			}}
		>
			<Pill style={{ width: 'fit-content' }}>One collector per machine</Pill>
			<div
				style={{
					...rise(frame, 2),
					fontSize: 82,
					fontWeight: 660,
					letterSpacing: '-0.055em',
					lineHeight: 1.02,
					marginTop: 92,
				}}
			>
				Two commands.
				<br />
				Then it runs itself.
			</div>

			<Surface
				color={COLORS.indigo}
				style={{
					marginTop: 96,
					opacity: command,
					overflow: 'hidden',
					transform: `translate3d(0, ${(1 - command) * 34}px, 0)`,
				}}
			>
				<div
					style={{
						alignItems: 'center',
						borderBottom: `1px solid ${COLORS.border}`,
						color: COLORS.muted,
						display: 'flex',
						fontSize: 20,
						gap: 11,
						padding: '18px 22px',
					}}
				>
					<span style={{ background: '#ff5f57', borderRadius: 999, height: 10, width: 10 }} />
					<span style={{ background: '#febc2e', borderRadius: 999, height: 10, width: 10 }} />
					<span style={{ background: '#28c840', borderRadius: 999, height: 10, width: 10 }} />
					<span style={{ marginLeft: 8 }}>terminal</span>
				</div>
				<div
					style={{
						fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
						fontSize: 25,
						lineHeight: 1.7,
						padding: '30px 30px 34px',
					}}
				>
					<div style={{ opacity: progress(frame, 10, 10) }}>
						<span style={{ color: COLORS.indigo }}>$</span> npm i -g @usagefleet/cli
					</div>
					<div style={{ opacity: progress(frame, 18, 10) }}>
						<span style={{ color: COLORS.indigo }}>$</span> usagefleet login uf_••••••
					</div>
				</div>
			</Surface>

			<div style={{ display: 'flex', gap: 16, marginTop: 36 }}>
				{['macOS', 'Linux', 'Windows'].map((os, index) => {
					const appear = progress(frame, 26 + index * 4, 12)
					return (
						<div
							key={os}
							style={{
								background: 'rgba(255,255,255,0.06)',
								border: `1px solid ${COLORS.border}`,
								borderRadius: 999,
								fontSize: 25,
								fontWeight: 610,
								opacity: appear,
								padding: '17px 27px',
								transform: `translate3d(0, ${(1 - appear) * 18}px, 0)`,
							}}
						>
							{os}
						</div>
					)
				})}
			</div>

			<div
				style={{
					color: COLORS.muted,
					fontSize: 25,
					lineHeight: 1.4,
					marginTop: 42,
					maxWidth: 820,
					opacity: progress(frame, 38, 12),
				}}
			>
				Background service, desktop alerts, and automatic updates included.
			</div>
		</AbsoluteFill>
	)
}

function ConversionEndScene() {
	const frame = useCurrentFrame()
	const dim = interpolate(frame, [0, 12], [0.4, 1], clamp)

	return (
		<div style={{ opacity: dim }}>
			<EndCard
				kicker='No prompts leave · just usage numbers'
				title={
					<>
						Claude Code,
						<br />
						every machine, one view.
					</>
				}
			/>
		</div>
	)
}

export function ClaudeCodeOnMultipleMachines() {
	return (
		<VideoCanvas>
			<Sequence from={0} durationInFrames={98}>
				<Camera duration={98}>
					<FleetHookScene />
				</Camera>
			</Sequence>
			<Sequence from={90} durationInFrames={118}>
				<Camera duration={118}>
					<AttributionScene />
				</Camera>
			</Sequence>
			<Sequence from={200} durationInFrames={96}>
				<Camera duration={96}>
					<DeviceHistoryScene />
				</Camera>
			</Sequence>
			<Sequence from={288} durationInFrames={84}>
				<Camera duration={84}>
					<InstallScene />
				</Camera>
			</Sequence>
			<Sequence from={364} durationInFrames={86}>
				<Camera duration={86}>
					<ConversionEndScene />
				</Camera>
			</Sequence>

			{/* Voiceover + captions — one clip per scene, absolute frame positions. */}
			<VoiceOver
				clips={[
					{ at: 4, src: 'vo/v2-s1.wav', text: 'Claude Code on multiple machines? One subscription.' },
					{ at: 96, src: 'vo/v2-s2.wav', text: 'UsageFleet shows which machines are spending it.' },
					{ at: 206, src: 'vo/v2-s3.wav', text: 'Usage and cost, split by device.' },
					{ at: 294, src: 'vo/v2-s4.wav', text: 'Setup? Two commands.' },
					{ at: 364, src: 'vo/v2-s5.wav', text: 'Nothing private leaves. UsageFleet.com' },
				]}
			/>

			{/* Music bed under everything; SFX punch through it. */}
			<Sound src='sfx/music.wav' volume={0.32} />
			<Sound at={8} src='sfx/pop.wav' volume={0.45} />
			<Sound at={34} src='sfx/pop.wav' volume={0.5} />
			<Sound at={90} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={110} src='sfx/pop.wav' volume={0.45} />
			<Sound at={200} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={212} src='sfx/pop.wav' volume={0.45} />
			<Sound at={288} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={298} src='sfx/pop.wav' volume={0.4} />
			<Sound at={306} src='sfx/pop.wav' volume={0.4} />
			<Sound at={364} src='sfx/whoosh.wav' volume={0.6} />
			<Sound at={368} src='sfx/ding.wav' volume={0.7} />

			<GameplayStrip src='gameplay/mc-2.mp4' />
		</VideoCanvas>
	)
}
