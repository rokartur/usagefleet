import type { ComponentProps, ReactNode } from 'react'
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'use-intl'
import { Accordion } from '@/components/arc/accordion/accordion'
import { AnimatedCounter } from '@/components/arc/animated-counter/animated-counter'
import { Badge } from '@/components/arc/badge/badge'
import { buttonClassName } from '@/components/arc/button/button'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import type { UsageMeterSegment } from '@/components/arc/usage-meter/usage-meter'
import { UsageMeter } from '@/components/arc/usage-meter/usage-meter'
import { InstallCommand } from '@/components/InstallCommand'
import { RelativeTime } from '@/components/RelativeTime'
import { clockLabel, ResetCountdown } from '@/components/ResetCountdown'
import { overrun, Section, UsageBar, WatchOnlyMark } from '@/components/usage-ui'
import { WindowChart } from '@/components/WindowChart'
import { useMounted } from '@/hooks/use-mounted'
import type { DashboardDTO, LiveGroupUsage, ModelLimitDTO } from '@/lib/data'
import { formatPct, formatPctNumber, formatRelative, formatTokens, formatUsd, roundTenth } from '@/lib/format'
import { TOKEN_PLACEHOLDER } from '@/lib/install-command'
import type { ModelUsage, TokenTotals } from '@/lib/usage'
import { billableTokens, LIMITS_STALE_MS } from '@/lib/usage'
import { cn } from '@/lib/utils'

const POLL_MS = 5000
const FIVE_H_MS = 5 * 60 * 60 * 1000
const SEVEN_D_MS = 7 * 24 * 60 * 60 * 1000
const VIEW_KEY = 'usagefleet:meter-view'

type MeterView = 'bar' | 'chart'

/** Bar or whole-window chart, remembered per browser. The server cannot know the
 *  choice, so the first paint is the bar and a stored chart lands after mount. */
function useMeterView() {
	const [view, setView] = useState<MeterView>('bar')
	useEffect(() => {
		if (localStorage.getItem(VIEW_KEY) === 'chart') {
			// oxlint-disable-next-line react/react-compiler -- storage is only readable after mount
			setView('chart')
		}
	}, [])
	const pickView = (next: MeterView) => {
		setView(next)
		localStorage.setItem(VIEW_KEY, next)
	}
	return { view, pickView }
}

/** Colored dot used for a group's identity across cards and tables. */
export function GroupDot({ color }: { color: string }) {
	return <span className='size-2 shrink-0 rounded-full' style={{ backgroundColor: color }} aria-hidden />
}

const groupKey = (groupId: string | null) => groupId ?? 'ungrouped'

/** An account's identity across polls: the unidentified bucket has no id. */
export const accountKey = (dash: DashboardDTO) => dash.accountId ?? 'unidentified'

/** A group with usage here but none of its devices on this account any more: it
 *  switched Claude accounts. Watch-only groups never hold a slice, so they don't count. */
const movedAway = (g: LiveGroupUsage) => !g.watchOnly && g.devices.length === 0

/** Whose subscription this card reports on. An account the collector could not
 *  name (API-key login, or a collector too old to report one) is the bucket
 *  every unidentified device falls into. */
function useAccountName(): (dash: DashboardDTO) => string {
	const t = useTranslations('dash.overview')
	return dash => dash.accountLabel ?? t('unidentifiedAccount')
}

/** "live · subscription · updated 40s ago" for one account. A dead poll is a
 *  fleet-wide fact, the report age is per account: one machine can stop
 *  reporting while the other keeps going. `now` is 0 until the tab mounts, and
 *  everything clock-derived stays out of the markup until then: the server's
 *  wall clock is not the viewer's, so an age rendered during SSR can hydrate
 *  into different text. */
function StatusLine({ dash, now, pollDown }: { dash: DashboardDTO; now: number; pollDown: boolean }) {
	const t = useTranslations('dash.overview')
	const locale = useLocale()
	const reportAge = now && dash.reportedAt ? now - Date.parse(dash.reportedAt) : 0
	const stale = pollDown || reportAge > LIMITS_STALE_MS
	const label = pollDown ? t('reconnecting') : stale ? t('collectorOffline') : t('live')
	const source = dash.source === 'sub' ? t('sourceSub') : dash.source === 'api' ? t('sourceApi') : t('sourceNone')
	return (
		<p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
			<Badge tone={stale ? 'warning' : 'success'} size='sm'>
				{label}
			</Badge>
			<span>
				{source}
				{now && dash.reportedAt ? t('updated', { age: formatRelative(dash.reportedAt, locale) }) : ''}
			</span>
		</p>
	)
}

/** What the dashboard needs to tell a fresh account which step it is on.
 *  `reportedEver` is any authenticated collector call (see devices.lastSeenAt),
 *  which separates "installer never ran" from "runs, but found no Claude
 *  login" — the two failures that look identical from an empty dashboard. */
export interface SetupState {
	deviceName: string | null
	reportedEver: boolean
}

function Step({
	n,
	title,
	state,
	stateLabel,
	children,
}: {
	n: number
	title: string
	state: 'done' | 'now' | 'waiting'
	stateLabel: string
	children?: React.ReactNode
}) {
	return (
		<li className='flex gap-4 border-t py-4'>
			<span
				className={cn(
					'mt-0.5 w-4 shrink-0 text-sm tabular-nums',
					state === 'now' ? 'text-foreground' : 'text-muted-foreground',
				)}
				aria-hidden
			>
				{state === 'done' ? <CheckIcon className='size-4 text-success' /> : n}
			</span>
			<div className='flex min-w-0 flex-1 flex-col gap-3'>
				<p className={cn('text-sm', state === 'waiting' && 'text-muted-foreground')}>{title}</p>
				{children}
			</div>
			<span className='shrink-0 text-sm text-muted-foreground'>{stateLabel}</span>
		</li>
	)
}

/** The whole dashboard until the first report lands: which of the three setup
 *  steps you are on, and the exact command for the one you're on. */
function SetupRail({ setup }: { setup: SetupState | null }) {
	const t = useTranslations('dash.overview')
	const device = setup?.deviceName
	const machine = device ?? t('thatMachine')
	const reported = setup?.reportedEver ?? false
	const stepState = reported ? 'done' : device ? 'now' : 'waiting'

	return (
		<section>
			<h2 className='text-sm font-medium'>{t('setupTitle')}</h2>
			<p className='mt-1 text-sm text-muted-foreground'>{t('setupDescription')}</p>
			<ol className='mt-5 [&>li:last-child]:border-b'>
				<Step
					n={1}
					title={device ? t('deviceAdded', { name: device }) : t('setupStepAddDevice')}
					state={device ? 'done' : 'now'}
					stateLabel={t(device ? 'done' : 'now')}
				>
					{!device && (
						<div className='flex flex-col gap-2'>
							<Link to='/devices' className={buttonClassName({ className: 'w-fit' })}>
								{t('addDevice')}
							</Link>
							<p className='text-xs text-muted-foreground'>{t('setupDeviceHint')}</p>
						</div>
					)}
				</Step>

				<Step n={2} title={t('installerStep', { machine })} state={stepState} stateLabel={t(stepState)}>
					{device && !reported && (
						<div className='flex flex-col gap-2'>
							<InstallCommand token={TOKEN_PLACEHOLDER} />
							<p className='text-xs text-muted-foreground'>
								{t.rich('installerHint', {
									devices: chunks => (
										<Link to='/devices' className='underline underline-offset-2'>
											{chunks}
										</Link>
									),
									machine,
								})}
							</p>
						</div>
					)}
				</Step>

				<Step
					n={3}
					title={t('setupStepReport')}
					state={reported ? 'now' : 'waiting'}
					stateLabel={t(reported ? 'now' : 'waiting')}
				>
					<p className='text-xs text-muted-foreground'>
						{reported
							? t.rich('reportPending', {
									cmd: chunks => <code className='font-mono'>{chunks}</code>,
									machine,
								})
							: t('reportWaiting')}
					</p>
				</Step>
			</ol>
		</section>
	)
}

/** The top section for one Anthropic account at a time: its limit windows cut
 *  into the groups' contributions, spend, and the groups against their slices.
 *  With several accounts a switcher picks which. Polls the whole set at once:
 *  /api/dashboard answers for all of them.
 *  `poll: false` renders `initial` as the route loader last returned it — the
 *  admin's per-user view, where /api/dashboard would answer with the viewer's
 *  own accounts, not these. */
export function LiveDashboard({
	initial,
	setup,
	selected,
	onSelect,
	poll = true,
}: {
	initial: DashboardDTO[]
	setup: SetupState | null
	/** Key of the account shown (see {@link accountKey}), null for the first; the
	 *  page owns it so the past-windows chart follows the same account. */
	selected: string | null
	onSelect: (key: string) => void
	poll?: boolean
}) {
	const t = useTranslations('dash.overview')
	const tUsage = useTranslations('dash.usage')
	const [polled, setPolled] = useState<DashboardDTO[]>(initial)
	const dashes = poll ? polled : initial
	const [lastOk, setLastOk] = useState(() => Date.now())
	// `now` advances once a second (below) so the staleness check stays a pure
	// read of state during render, and reads 0 until the client owns the tree: the
	// server's clock is not the viewer's, so an age rendered into the SSR markup
	// hydrates into different text. 0 reads as "fresh", which a page that just
	// rendered is.
	const [clock, setClock] = useState(() => Date.now())
	const now = useMounted() ? clock : 0
	// Serialises polling: /api/dashboard scans the whole window, so a server
	// slower than POLL_MS would otherwise stack a new request every tick and add
	// load to something already struggling. One outstanding request at a time also
	// means responses can never land out of order.
	const inFlightRef = useRef(false)

	const refresh = useCallback(async () => {
		if (inFlightRef.current) {
			return
		}
		inFlightRef.current = true
		try {
			// The in-flight guard serialises polls, so a request that never settles
			// would park every later tick for the life of the tab. The deadline is what
			// ends one. Unmount does not abort in flight: clearing the interval already
			// stops new polls, and one discarded response costs less than composing
			// signals with AbortSignal.any, which needs a newer browser than anything
			// else this app relies on.
			const res = await fetch('/api/dashboard', {
				cache: 'no-store',
				signal: AbortSignal.timeout(POLL_MS * 3),
			})
			if (res.status === 401) {
				window.location.href = '/login'
				return
			}
			if (res.ok) {
				// One payload per Anthropic account. An empty array would mean the
				// account list is still being built server-side; keep what we have.
				const all = (await res.json()) as DashboardDTO[]
				if (all.length > 0) {
					setPolled(all)
					setLastOk(Date.now())
				}
			}
		} catch {
			/* transient network/abort — keep last good data; staleness shows below */
		} finally {
			inFlightRef.current = false
		}
	}, [])

	useEffect(() => {
		const ticker = setInterval(() => setClock(Date.now()), 1000)
		if (!poll) {
			return () => clearInterval(ticker)
		}
		// A background tab would cost the server a full dashboard query every 5s for nobody.
		const id = setInterval(() => {
			if (document.visibilityState === 'visible') {
				refresh()
			}
		}, POLL_MS)
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				// No polls ran while hidden, so count "reconnecting" from now, not from the last one.
				setLastOk(Date.now())
				refresh()
			}
		}
		document.addEventListener('visibilitychange', onVisible)
		return () => {
			clearInterval(id)
			clearInterval(ticker)
			document.removeEventListener('visibilitychange', onVisible)
		}
	}, [refresh, poll])

	const pollDown = poll && now - lastOk > 3 * POLL_MS
	const dash = dashes.find(d => accountKey(d) === selected) ?? dashes[0]
	const { view, pickView } = useMeterView()
	const locale = useLocale()

	if (!dash?.connected) {
		return <SetupRail setup={setup} />
	}

	const projection = now > 0 ? dash.sessionProjection : null
	const nextLabel = projection?.next ? `${projection.next.pct}% ${clockLabel(projection.next.at, locale)}` : undefined
	const fullLabel = projection?.fullAt
		? t('fullMark', { clock: clockLabel(projection.fullAt, locale) ?? '' })
		: undefined
	// Drawn only once the client owns the tree: where "now" sits on the axis is the viewer's clock.
	const chart = (
		resetsAt: string | null,
		windowMs: number,
		points: DashboardDTO['fiveHourPoints'],
		pct: number,
		forecast: boolean,
	) => {
		if (view !== 'chart' || now === 0 || !resetsAt) {
			return null
		}
		const end = Date.parse(resetsAt)
		return (
			<WindowChart
				points={points}
				pct={pct}
				start={end - windowMs}
				end={end}
				now={now}
				projection={forecast ? projection : null}
				nextLabel={forecast ? nextLabel : undefined}
			/>
		)
	}

	return (
		<Section
			title={t('currentUsage')}
			actions={
				<div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
					<StatusLine dash={dash} now={now} pollDown={pollDown} />
					<SegmentedControl
						label={t('meterView')}
						value={view}
						onValueChange={pickView}
						options={[
							{ label: t('meterViewBar'), value: 'bar' },
							{ label: t('meterViewChart'), value: 'chart' },
						]}
					/>
				</div>
			}
		>
			<div className='flex flex-col gap-8'>
				{dashes.length > 1 && (
					<AccountSwitcher dashes={dashes} selected={accountKey(dash)} onSelect={onSelect} now={now} />
				)}
				<div className='grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-x-8 gap-y-6'>
					<Meter
						label={t('fiveHourSession')}
						pct={dash.fiveHourPct}
						projected={dash.sessionProjection?.pct}
						mark={view === 'bar' && projection ? sessionMark(projection, nextLabel, fullLabel) : undefined}
						chart={chart(dash.fiveHourResetsAt, FIVE_H_MS, dash.fiveHourPoints, dash.fiveHourPct, true)}
						resets={<ResetCountdown resetsAt={dash.fiveHourResetsAt} projection={dash.sessionProjection} />}
						segments={dash.groups.map(g => ({
							color: g.color,
							id: groupKey(g.groupId),
							label: g.name,
							value: g.sessionAccountPct,
						}))}
					/>
					<Meter
						label={tUsage('weekly')}
						pct={dash.sevenDayPct}
						chart={chart(dash.sevenDayResetsAt, SEVEN_D_MS, dash.sevenDayPoints, dash.sevenDayPct, false)}
						resets={<ResetCountdown resetsAt={dash.sevenDayResetsAt} />}
						segments={dash.groups.map(g => ({
							color: g.color,
							id: groupKey(g.groupId),
							label: g.name,
							value: g.weeklyAccountPct,
						}))}
					/>
					{dash.modelLimits.map(limit => (
						<Meter
							key={limit.model}
							label={limit.label}
							pct={limit.pct}
							resets={<ResetCountdown resetsAt={limit.resetsAt} />}
							segments={limit.groups.map(g => ({
								color: g.color,
								id: groupKey(g.groupId),
								label: g.name,
								value: g.accountPct,
							}))}
						/>
					))}
					<Spend dash={dash} />
				</div>
				<GroupList dash={dash} dashes={dashes} />
			</div>
		</Section>
	)
}
/** The pill under the session bar: the moment the limit runs out if it comes
 *  before the reset, otherwise the next full ten on the way. */
function sessionMark(
	projection: NonNullable<DashboardDTO['sessionProjection']>,
	nextLabel: string | undefined,
	fullLabel: string | undefined,
) {
	if (fullLabel) {
		return { label: fullLabel, over: true, value: 100 }
	}
	if (projection.next && nextLabel) {
		return { label: nextLabel, value: projection.next.pct }
	}
}

function AccountSwitcher({
	dashes,
	selected,
	onSelect,
	now,
}: {
	dashes: DashboardDTO[]
	selected: string
	onSelect: (key: string) => void
	now: number
}) {
	const t = useTranslations('dash.overview')
	const accountName = useAccountName()
	return (
		<SegmentedControl
			label={t('accountSwitcher')}
			value={selected}
			onValueChange={onSelect}
			options={dashes.map(d => {
				const stale = now > 0 && d.reportedAt !== null && now - Date.parse(d.reportedAt) > LIMITS_STALE_MS
				const moved = d.groups.filter(movedAway).length
				return {
					accessory: (
						<span className='ml-2 inline-flex items-center gap-2 text-xs font-normal text-muted-foreground tabular-nums'>
							<span className={overrun(d.fiveHourPct)}>{formatPct(d.fiveHourPct)}</span>
							{moved > 0 && <span>{t('movedBadge', { count: moved })}</span>}
							{stale && <span className='size-1.5 rounded-full bg-warning' aria-hidden />}
						</span>
					),
					label: accountName(d),
					value: accountKey(d),
				}
			})}
		/>
	)
}

/** One limit window: Anthropic's figure, cut into the groups' contributions.
 *  What they leave of it no collector's events explain: usage from outside the
 *  fleet (claude.ai, phone, a machine without the collector). The landing
 *  preview draws it too, with a fixed reset line instead of a countdown. */
export function Meter({
	label,
	pct,
	projected,
	mark,
	chart,
	resets,
	segments,
}: {
	label: string
	pct: number
	projected?: number
	mark?: ComponentProps<typeof UsageMeter>['mark']
	chart?: ReactNode
	resets: ReactNode
	segments: UsageMeterSegment[]
}) {
	const t = useTranslations('dash.usage')
	const tMeter = useTranslations('dash.usage.meter')
	const locale = useLocale()
	const outside = pct - segments.reduce((sum, s) => sum + s.value, 0)
	// The meter's headline is the segments' sum, which must stay Anthropic's
	// number: any outside share that survives rounding to a tenth is drawn.
	const bars =
		roundTenth(outside) > 0
			? [...segments, { color: 'var(--text-muted)', id: 'outside', label: t('outside'), value: outside }]
			: segments
	return (
		<div className='flex min-w-0 flex-col gap-3'>
			<UsageMeter
				label={label}
				segments={bars}
				limit={100}
				projected={projected}
				mark={mark}
				chart={chart}
				unit='%'
				locale={locale}
				legend={false}
				messages={{
					almostFull: tMeter('almostFull'),
					byCategory: label => tMeter('byCategory', { label }),
					caption: () => tMeter('caption'),
					free: tMeter('free'),
					freeAmount: amount => tMeter('freeAmount', { amount }),
					freeCaption: tMeter('freeCaption'),
					over: tMeter('over'),
					overAmount: amount => tMeter('overAmount', { amount }),
					overCaption: tMeter('overCaption'),
					segmentCaption: label => tMeter('segmentCaption', { label }),
					usedOf: used => tMeter('usedOf', { used }),
				}}
			/>
			<div className='text-xs text-muted-foreground'>{resets}</div>
		</div>
	)
}

/** The groups with usage on this account, one card each against its slice.
 *  Which machines are on the account and what they ran folds away below. */
function GroupList({ dash, dashes }: { dash: DashboardDTO; dashes: DashboardDTO[] }) {
	// Where a group that left this account went: the one its devices are on now.
	const accountName = useAccountName()
	const movedTo = (g: LiveGroupUsage) => {
		const other = dashes.find(
			d => d !== dash && d.groups.some(x => x.groupId === g.groupId && x.devices.length > 0),
		)
		return other ? accountName(other) : null
	}
	const t = useTranslations('dash.overview')
	return (
		<section aria-labelledby='groups-heading' className='flex flex-col gap-3'>
			<h3 id='groups-heading' className='text-sm font-medium'>
				<abbr title={t('sliceHint')} className='no-underline'>
					{t('groups')}
				</abbr>
			</h3>
			<ul className='grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3'>
				{dash.groups.map(g => (
					<li key={groupKey(g.groupId)} className='min-w-0 rounded-(--radius-panel) border p-4'>
						<GroupSummary
							group={g}
							modelLimits={dash.modelLimits}
							movedTo={movedAway(g) ? movedTo(g) : null}
						/>
					</li>
				))}
			</ul>
			<Accordion
				items={[
					{
						value: 'details',
						title: t('devicesAndModels'),
						content: <ModelMix groups={dash.groups} />,
					},
				]}
			/>
		</section>
	)
}

function GroupSummary({
	group: g,
	modelLimits,
	movedTo,
}: {
	group: LiveGroupUsage
	modelLimits: ModelLimitDTO[]
	movedTo: string | null
}) {
	const t = useTranslations('dash.overview')
	const moved = movedAway(g)
	return (
		<div className='flex flex-col gap-3'>
			<div className='flex min-w-0 items-center gap-2 text-sm'>
				<GroupDot color={g.color} />
				<span className='truncate font-medium'>{g.name}</span>
				{g.watchOnly && <WatchOnlyMark />}
				<span className='ml-auto shrink-0 text-xs text-muted-foreground'>
					{g.slicePct !== null && `${t('slice', { pct: formatPctNumber(g.slicePct) })} · `}
					{t('devicesCount', { count: g.devices.length })}
				</span>
			</div>
			<div className={cn('flex flex-col gap-2', moved && 'opacity-60')}>
				<SliceBar label='5h' pct={g.sessionBudgetPct} color={g.color} />
				<SliceBar label={t('week')} pct={g.weeklyBudgetPct} color={g.color} />
				{modelLimits.map(limit => (
					<SliceBar
						key={limit.model}
						label={limit.label}
						// Absent from the split means no events of this model in its window.
						pct={limit.groups.find(x => x.groupId === g.groupId)?.budgetPct ?? 0}
						color={g.color}
					/>
				))}
			</div>
			{moved && (
				<p className='text-xs text-muted-foreground'>
					{movedTo
						? t.rich('movedTo', {
								account: movedTo,
								mark: chunks => <span className='text-foreground'>{chunks}</span>,
								time: () => (
									<RelativeTime date={g.lastUsedAt === null ? null : new Date(g.lastUsedAt)} />
								),
							})
						: t('moved')}
				</p>
			)}
		</div>
	)
}

const BUCKETS = [
	{ key: 'tokensIn', tokens: (t: TokenTotals) => t.inputTokens, fill: 'bg-foreground/90' },
	{ key: 'tokensOut', tokens: (t: TokenTotals) => t.outputTokens, fill: 'bg-foreground/65' },
	{ key: 'tokensCacheWrite', tokens: (t: TokenTotals) => t.cacheCreationTokens, fill: 'bg-foreground/45' },
	{ key: 'tokensCacheRead', tokens: (t: TokenTotals) => t.cacheReadTokens, fill: 'bg-foreground/25' },
] as const

/** Each group's machines beside the models they ran, every model a bar split
 *  into token kinds. Bar length is against the busiest model on the account,
 *  so rows compare across groups. */
function ModelMix({ groups }: { groups: LiveGroupUsage[] }) {
	const t = useTranslations('dash.overview')
	const maxTokens = Math.max(0, ...groups.flatMap(g => g.models.map(m => m.totals.totalTokens)))
	return (
		<div className='flex flex-col'>
			<ul className='flex flex-wrap gap-x-4 gap-y-1 pb-3 text-xs text-muted-foreground'>
				{BUCKETS.map(b => (
					<li key={b.key} className='flex items-center gap-1.5'>
						<span className={cn('size-2.5 rounded-[3px]', b.fill)} />
						{t(b.key)}
					</li>
				))}
			</ul>
			{groups.map(g => (
				<div
					key={groupKey(g.groupId)}
					className='grid gap-3 border-t py-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6'
				>
					<div className='flex min-w-0 flex-col gap-1.5'>
						<p className='flex min-w-0 items-center gap-2 text-sm font-medium'>
							<GroupDot color={g.color} />
							<span className='truncate'>{g.name}</span>
						</p>
						<ul className='text-xs'>
							{g.devices.map(d => (
								<li key={d.id} className='flex justify-between gap-3 py-0.5'>
									<span className='truncate'>{d.name}</span>
									<span className='shrink-0 text-muted-foreground'>
										<RelativeTime date={d.lastSeenAt === null ? null : new Date(d.lastSeenAt)} />
									</span>
								</li>
							))}
						</ul>
					</div>
					<ul className='flex flex-col gap-3'>
						{g.models.map(m => (
							<ModelRow key={m.model} model={m} maxTokens={maxTokens} />
						))}
					</ul>
				</div>
			))}
		</div>
	)
}

function ModelRow({ model: m, maxTokens }: { model: ModelUsage; maxTokens: number }) {
	const t = useTranslations('dash.overview')
	const buckets = BUCKETS.map(b => ({ ...b, value: b.tokens(m.totals) })).filter(b => b.value > 0)
	const readout = buckets.map(b => `${t(b.key)} ${formatTokens(b.value)}`).join(', ')
	return (
		<li className='grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 text-sm md:grid-cols-[9rem_minmax(0,1fr)_7rem_4.5rem]'>
			<span className='truncate' title={m.model}>
				{m.label}
			</span>
			<div className='col-span-2 row-start-2 min-w-0 md:col-span-1 md:row-start-auto'>
				<Tooltip
					content={
						<span className='grid grid-cols-[auto_auto] gap-x-4 tabular-nums'>
							{buckets.map(b => (
								<Fragment key={b.key}>
									<span>{t(b.key)}</span>
									<span className='text-right'>{formatTokens(b.value)}</span>
								</Fragment>
							))}
						</span>
					}
				>
					<button
						type='button'
						aria-label={`${m.label}: ${readout}`}
						className='flex h-2.5 min-w-1 gap-0.5 overflow-hidden rounded-[4px] outline-offset-2'
						style={{ width: `${maxTokens > 0 ? (m.totals.totalTokens / maxTokens) * 100 : 0}%` }}
					>
						{buckets.map(b => (
							<span
								key={b.key}
								className={cn('min-w-0.5 basis-0', b.fill)}
								style={{ flexGrow: b.value }}
							/>
						))}
					</button>
				</Tooltip>
			</div>
			<span className='hidden text-right whitespace-nowrap text-muted-foreground tabular-nums md:block'>
				{t('modelRequests', { count: m.requests })}
			</span>
			<span className='text-right font-medium tabular-nums'>{formatUsd(m.costUsd)}</span>
		</li>
	)
}

export function SliceBar({ label, pct, color }: { label: string; pct: number; color: string }) {
	return (
		<div className='flex items-center gap-2 text-xs'>
			<span className='w-10 shrink-0 text-muted-foreground'>{label}</span>
			<UsageBar pct={pct} color={color} />
			<span className={cn('w-14 shrink-0 text-right text-sm font-medium tabular-nums', overrun(pct))}>
				{formatPct(pct)}
			</span>
		</div>
	)
}

/** Laid out like a meter beside it: label row, then the figure on the same baseline. */
function Spend({ dash }: { dash: DashboardDTO }) {
	const t = useTranslations('dash.overview')
	return (
		<div className='flex min-w-0 flex-col gap-4'>
			<p className='flex min-h-7 items-center text-base font-medium'>{t('spendWeek')}</p>
			<AnimatedCounter value={dash.spend.week.costUsd} prefix='$' decimals={2} animateOnView />
			<p className='text-xs text-muted-foreground'>
				{formatTokens(billableTokens(dash.spend.week.totals))} · {formatUsd(dash.spend.month.costUsd)}{' '}
				{t('month')}
			</p>
		</div>
	)
}
