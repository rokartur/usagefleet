import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckIcon } from 'lucide-react'
import { useLocale, useTranslations } from 'use-intl'
import { Accordion } from '@/components/arc/accordion/accordion'
import { Badge } from '@/components/arc/badge/badge'
import { buttonClassName } from '@/components/arc/button/button'
import { MetricCard } from '@/components/arc/metric-card/metric-card'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import type { UsageMeterSegment } from '@/components/arc/usage-meter/usage-meter'
import { UsageMeter } from '@/components/arc/usage-meter/usage-meter'
import { InstallCommand } from '@/components/InstallCommand'
import { RelativeTime } from '@/components/RelativeTime'
import { ResetCountdown } from '@/components/ResetCountdown'
import { overrun, UsageBar, WatchOnlyMark } from '@/components/usage-ui'
import { useMounted } from '@/hooks/use-mounted'
import type { DashboardDTO, LiveGroupUsage, ModelLimitDTO } from '@/lib/data'
import { formatPct, formatPctNumber, formatRelative, formatTokens, formatUsd, roundTenth } from '@/lib/format'
import { TOKEN_PLACEHOLDER } from '@/lib/install-command'
import type { ModelUsage } from '@/lib/usage'
import { billableTokens, LIMITS_STALE_MS, sameReset } from '@/lib/usage'
import { cn } from '@/lib/utils'

const POLL_MS = 5000

/** Colored dot used for a group's identity across cards and tables. */
function GroupDot({ color }: { color: string }) {
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

/** The live column for one Anthropic account at a time: its two windows cut into
 *  the groups' contributions, the groups against their slices, and spend. With
 *  several accounts a switcher on top picks which. Polls the whole set at once:
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

	if (!dash?.connected) {
		return <SetupRail setup={setup} />
	}

	return (
		<div className='flex flex-col divide-y'>
			<div className='flex flex-col gap-3 pb-5'>
				{dashes.length > 1 && (
					<AccountSwitcher dashes={dashes} selected={accountKey(dash)} onSelect={onSelect} now={now} />
				)}
				<StatusLine dash={dash} now={now} pollDown={pollDown} />
			</div>
			<Meter
				label={t('fiveHourSession')}
				pct={dash.fiveHourPct}
				resetsAt={dash.fiveHourResetsAt}
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
				resetsAt={dash.sevenDayResetsAt}
				segments={dash.groups.map(g => ({
					color: g.color,
					id: groupKey(g.groupId),
					label: g.name,
					value: g.weeklyAccountPct,
				}))}
			>
				{dash.modelLimits.map(limit => (
					<ModelLimitRow key={limit.model} limit={limit} weeklyResetsAt={dash.sevenDayResetsAt} />
				))}
			</Meter>
			<GroupList dash={dash} dashes={dashes} />
			<Spend dash={dash} />
		</div>
	)
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
 *  fleet (claude.ai, phone, a machine without the collector). */
function Meter({
	label,
	pct,
	resetsAt,
	segments,
	children,
}: {
	label: string
	pct: number
	resetsAt: string | null
	segments: UsageMeterSegment[]
	children?: React.ReactNode
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
		<section className='flex flex-col gap-3 py-5'>
			<UsageMeter
				label={label}
				segments={bars}
				limit={100}
				unit='%'
				locale={locale}
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
			<p className='text-xs text-muted-foreground'>
				<ResetCountdown resetsAt={resetsAt} />
			</p>
			{children}
		</section>
	)
}

/** A per-model limit (Fable weekly) under the window it shares. Its reset only
 *  shows when it differs from that window's. */
function ModelLimitRow({ limit, weeklyResetsAt }: { limit: ModelLimitDTO; weeklyResetsAt: string | null }) {
	return (
		<div className='mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm'>
			<span>{limit.label}</span>
			<UsageBar pct={limit.pct} className='w-24' />
			<span className={cn('font-medium tabular-nums', overrun(limit.pct))}>{formatPct(limit.pct)}</span>
			{!sameReset(limit.resetsAt, weeklyResetsAt) && (
				<span className='text-xs text-muted-foreground'>
					<ResetCountdown resetsAt={limit.resetsAt} />
				</span>
			)}
		</div>
	)
}

/** The groups with usage on this account, each against its slice. Expanding a
 *  row shows which machines are on the account and what they ran. */
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
		<section aria-labelledby='groups-heading' className='py-5'>
			<h2 id='groups-heading' className='mb-2 text-sm font-medium'>
				<abbr title={t('sliceHint')} className='no-underline'>
					{t('groups')}
				</abbr>
			</h2>
			<Accordion
				items={dash.groups.map(g => ({
					value: groupKey(g.groupId),
					title: (
						<GroupSummary
							group={g}
							modelLimits={dash.modelLimits}
							movedTo={movedAway(g) ? movedTo(g) : null}
						/>
					),
					content: <GroupDetails group={g} />,
				}))}
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
		<span className='flex flex-col gap-1.5 py-1 font-normal'>
			<span className='flex min-w-0 items-center gap-2 text-sm'>
				<GroupDot color={g.color} />
				<span className='truncate font-medium'>{g.name}</span>
				{g.watchOnly && <WatchOnlyMark />}
				<span className='ml-auto shrink-0 text-xs text-muted-foreground'>
					{g.slicePct !== null && `${t('slice', { pct: formatPctNumber(g.slicePct) })} · `}
					{t('devicesCount', { count: g.devices.length })}
				</span>
			</span>
			<span className={cn('grid grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-4', moved && 'opacity-60')}>
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
			</span>
			{moved && (
				<span className='text-xs text-muted-foreground'>
					{movedTo
						? t.rich('movedTo', {
								account: movedTo,
								mark: chunks => <span className='text-foreground'>{chunks}</span>,
								time: () => (
									<RelativeTime date={g.lastUsedAt === null ? null : new Date(g.lastUsedAt)} />
								),
							})
						: t('moved')}
				</span>
			)}
		</span>
	)
}

function GroupDetails({ group: g }: { group: LiveGroupUsage }) {
	const t = useTranslations('dash.overview')
	const groupCostUsd = g.models.reduce((sum, m) => sum + m.costUsd, 0)
	return (
		<div className='flex flex-col gap-3 pl-4 text-xs'>
			{g.devices.length > 0 && (
				<ul>
					{g.devices.map(d => (
						<li key={d.id} className='flex justify-between gap-3 py-0.5'>
							<span className='truncate'>{d.name}</span>
							<span className='shrink-0 text-muted-foreground'>
								<RelativeTime date={d.lastSeenAt === null ? null : new Date(d.lastSeenAt)} />
							</span>
						</li>
					))}
				</ul>
			)}
			<div>
				<p className='mb-1 text-muted-foreground'>{t('models')}</p>
				<ul>
					{g.models.map(m => (
						<ModelRow key={m.model} model={m} groupCostUsd={groupCostUsd} />
					))}
				</ul>
			</div>
		</div>
	)
}

function ModelRow({ model: m, groupCostUsd }: { model: ModelUsage; groupCostUsd: number }) {
	const t = useTranslations('dash.overview')
	const sharePct = groupCostUsd > 0 ? Math.round((m.costUsd / groupCostUsd) * 100) : 0
	const buckets = [
		{ key: 'tokensIn', tokens: m.totals.inputTokens },
		{ key: 'tokensOut', tokens: m.totals.outputTokens },
		{ key: 'tokensCacheWrite', tokens: m.totals.cacheCreationTokens },
		{ key: 'tokensCacheRead', tokens: m.totals.cacheReadTokens },
	] as const
	return (
		<li className='py-1.5'>
			<div className='flex justify-between gap-3'>
				<span className='truncate'>{m.label}</span>
				<span className='shrink-0 tabular-nums'>
					{formatTokens(m.billableTokens)} · {sharePct}%
				</span>
			</div>
			<p className='truncate text-muted-foreground'>
				{m.model} · {t('modelRequests', { count: m.requests })}
			</p>
			<p className='mt-0.5 grid grid-cols-2 gap-x-6 text-muted-foreground'>
				{buckets.map(b => (
					<span key={b.key} className='flex justify-between gap-2'>
						{t(b.key)} <span className='text-foreground tabular-nums'>{formatTokens(b.tokens)}</span>
					</span>
				))}
			</p>
		</li>
	)
}

function SliceBar({ label, pct, color }: { label: string; pct: number; color: string }) {
	return (
		<div className='flex items-center gap-2 text-xs'>
			<span className='min-w-7 shrink-0 text-muted-foreground'>{label}</span>
			<UsageBar pct={pct} color={color} />
			<span className={cn('w-14 shrink-0 text-right text-sm font-medium tabular-nums', overrun(pct))}>
				{formatPct(pct)}
			</span>
		</div>
	)
}

function Spend({ dash }: { dash: DashboardDTO }) {
	const t = useTranslations('dash.overview')
	return (
		<div className='pt-5'>
			<MetricCard
				label={t('spendWeek')}
				value={dash.spend.week.costUsd}
				prefix='$'
				decimals={2}
				context={`${formatTokens(billableTokens(dash.spend.week.totals))} · ${formatUsd(dash.spend.month.costUsd)} ${t('month')}`}
			/>
		</div>
	)
}
