import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckIcon } from 'lucide-react'
import { GroupTable } from '@/components/dashboard/GroupTable'
import type { GroupRow } from '@/components/dashboard/GroupTable'
import { InstallCommand } from '@/components/InstallCommand'
import { ResetCountdown } from '@/components/ResetCountdown'
import { Button } from '@/components/ui/button'
import { Num, Section, UsageBar } from '@/components/usage-ui'
import { useMounted } from '@/hooks/use-mounted'
import type { DashboardDTO, LiveGroupUsage, ModelLimitDTO, SpendPeriod } from '@/lib/data'
import { formatRelative, formatTokens, formatUsd } from '@/lib/format'
import { TOKEN_PLACEHOLDER } from '@/lib/install-command'
import { billableTokens, LIMITS_STALE_MS } from '@/lib/usage'
import { cn } from '@/lib/utils'

/** Percentages are Anthropic's own utilization, shown uncapped: an overrun
 *  ("105%") is the interesting case, even though the bar stops at full. */
const pctText = (n: number) => `${Math.round(n)}%`

/** Display label for a limit-window key: "5h" → "5-hour", "7d" → "weekly". */
function windowLabel(window: string): string {
	if (window === '5h') {
		return '5-hour'
	}
	if (window === '7d') {
		return 'weekly'
	}
	return window
}

const POLL_MS = 5000

/** Colored dot used for a group's identity across cards and tables. */
function GroupDot({ color }: { color: string }) {
	return <span className='size-2 shrink-0 rounded-full' style={{ backgroundColor: color }} aria-hidden />
}

/** "Artur 11% · Ciach 21%" — how one window's usage splits across groups. */
function GroupSplit({
	groups,
	className,
}: {
	groups: { key: string; name: string; color: string; pct: number }[]
	className?: string
}) {
	if (groups.length === 0) {
		return null
	}
	return (
		<div className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground', className)}>
			{groups.map(g => (
				<span key={g.key} className='flex min-w-0 items-center gap-1.5'>
					<GroupDot color={g.color} />
					<span className='truncate'>{g.name}</span>
					<Num value={g.pct} format={pctText} className='text-foreground' />
				</span>
			))}
		</div>
	)
}

const groupKey = (groupId: string | null) => groupId ?? 'ungrouped'

/** Whose subscription this card reports on. An account the collector could not
 *  name (API-key login, or a collector too old to report one) is the bucket
 *  every unidentified device falls into. */
const accountName = (dash: DashboardDTO) => dash.accountLabel ?? 'Unidentified account'

/** One window's usage split across the groups on this account. */
const splitOf = (dash: DashboardDTO, pct: (g: LiveGroupUsage) => number) =>
	dash.groups.map(g => ({
		color: g.color,
		key: groupKey(g.groupId),
		name: g.name,
		pct: pct(g),
	}))

/** "live · subscription · updated 40s ago" for one account. A dead poll is a
 *  fleet-wide fact, the report age is per account: one machine can stop
 *  reporting while the other keeps going. `now` is 0 until the tab mounts, and
 *  everything clock-derived stays out of the markup until then: the server's
 *  wall clock is not the viewer's, so an age rendered during SSR can hydrate
 *  into different text. */
function StatusLine({ dash, now, pollDown }: { dash: DashboardDTO; now: number; pollDown: boolean }) {
	const reportAge = now && dash.reportedAt ? now - Date.parse(dash.reportedAt) : 0
	const stale = pollDown || reportAge > LIMITS_STALE_MS
	const label = pollDown ? 'reconnecting…' : stale ? 'collector offline' : 'live'
	const source = dash.source === 'sub' ? 'subscription' : dash.source === 'api' ? 'API key' : '—'
	return (
		<p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
			<span className={cn('size-1.5 rounded-full', stale ? 'bg-amber-500' : 'bg-emerald-500')} aria-hidden />
			<span className={stale ? 'text-amber-500' : 'text-foreground'}>{label}</span>· {source}
			{now && dash.reportedAt ? ` · updated ${formatRelative(new Date(dash.reportedAt))}` : ''}
		</p>
	)
}

/** One column of the headline strip: label, one big number, detail underneath. */
function StatCell({ label, value, children }: { label: string; value: React.ReactNode; children?: React.ReactNode }) {
	return (
		<div className='flex flex-col gap-2 sm:border-l sm:pl-5 sm:first:border-l-0 sm:first:pl-0'>
			<div className='text-[11px] text-muted-foreground'>{label}</div>
			<div className='text-2xl leading-none tabular-nums'>{value}</div>
			{children}
		</div>
	)
}

/** Claude's own account utilization for one window, plus the per-group split —
 *  each group's usage against its own slice (1/group count), the same
 *  budget-relative measure as the group table. */
function LimitCell({
	label,
	pct,
	resetsAt,
	groups,
}: {
	label: string
	pct: number
	resetsAt: string | null
	groups: { key: string; name: string; color: string; pct: number }[]
}) {
	return (
		<StatCell label={label} value={<Num value={pct} format={pctText} />}>
			<UsageBar pct={pct} />
			<div className='text-[11px] text-muted-foreground'>
				<ResetCountdown resetsAt={resetsAt} />
			</div>
			<GroupSplit groups={groups} />
		</StatCell>
	)
}

function SpendCell({ label, period }: { label: string; period: SpendPeriod }) {
	return (
		<StatCell label={label} value={<Num value={period.costUsd} format={formatUsd} />}>
			<div className='text-[11px] text-muted-foreground tabular-nums'>
				<Num value={billableTokens(period.totals)} format={formatTokens} /> billable ·{' '}
				<Num value={period.totals.totalTokens} format={formatTokens} /> total
			</div>
		</StatCell>
	)
}

/** One per-model official limit on a single line. */
function ModelLimitRow({ limit }: { limit: ModelLimitDTO }) {
	return (
		<div className='flex flex-wrap items-center gap-x-3 gap-y-1 border-b py-2 text-sm last:border-b-0'>
			<span className='font-medium'>{limit.label}</span>
			<span className='text-[11px] text-muted-foreground'>{windowLabel(limit.window)}</span>
			<Num value={limit.pct} format={pctText} />
			<UsageBar pct={limit.pct} className='w-20 shrink-0' />
			<span className='text-[11px] text-muted-foreground'>
				<ResetCountdown resetsAt={limit.resetsAt} />
			</span>
			<GroupSplit
				className='ml-auto'
				groups={limit.groups.map(g => ({
					color: g.color,
					key: groupKey(g.groupId),
					name: g.name,
					pct: g.budgetPct,
				}))}
			/>
		</div>
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
	children,
}: {
	n: number
	title: string
	state: 'done' | 'now' | 'waiting'
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
				{state === 'done' ? <CheckIcon className='size-4 text-emerald-500' /> : n}
			</span>
			<div className='flex min-w-0 flex-1 flex-col gap-3'>
				<p className={cn('text-sm', state === 'waiting' && 'text-muted-foreground')}>{title}</p>
				{children}
			</div>
			<span className='shrink-0 text-sm text-muted-foreground'>
				{state === 'done' ? 'done' : state === 'now' ? 'now' : 'waiting'}
			</span>
		</li>
	)
}

/** The whole dashboard until the first report lands: which of the three setup
 *  steps you are on, and the exact command for the one you're on. */
function SetupRail({ setup }: { setup: SetupState | null }) {
	const device = setup?.deviceName
	const machine = device ?? 'that machine'
	const reported = setup?.reportedEver ?? false

	return (
		<section>
			<h2 className='text-sm font-medium'>No data yet</h2>
			<p className='mt-1 text-sm text-muted-foreground'>
				Three steps, about a minute. This page fills in on its own.
			</p>
			<ol className='mt-5 [&>li:last-child]:border-b'>
				<Step n={1} title={device ? `Device added: ${device}` : 'Add a device'} state={device ? 'done' : 'now'}>
					{!device && (
						<div className='flex flex-col gap-2'>
							<Button render={<Link to='/devices' />} className='w-fit'>
								Add device
							</Button>
							<p className='text-xs text-muted-foreground'>
								One device is one machine you use Claude on. You get its token there.
							</p>
						</div>
					)}
				</Step>

				<Step
					n={2}
					title={`Run the installer on ${machine}`}
					state={reported ? 'done' : device ? 'now' : 'waiting'}
				>
					{device && !reported && (
						<div className='flex flex-col gap-2'>
							<InstallCommand token={TOKEN_PLACEHOLDER} />
							<p className='text-xs text-muted-foreground'>
								Put in the token you copied when you added {machine}. Lost it? Tokens are shown once, so
								add the device again on{' '}
								<Link to='/devices' className='underline underline-offset-2'>
									Devices
								</Link>
								.
							</p>
						</div>
					)}
				</Step>

				<Step n={3} title='First usage report' state={reported ? 'now' : 'waiting'}>
					<p className='text-xs text-muted-foreground'>
						{reported ? (
							<>
								{machine} is reporting, but no Claude limits came with it yet. Run{' '}
								<code className='font-mono'>usagefleet status</code> there: it prints whether it found
								your Claude login.
							</>
						) : (
							<>
								Arrives within a minute of the installer finishing, then every five. Your 5-hour and
								weekly numbers replace this list.
							</>
						)}
					</p>
				</Step>
			</ol>
		</section>
	)
}

/** One window inside an account row: the percentage, the bar, the countdown and
 *  the group split, at half the size of the single-account headline cell. */
function AccountWindow({
	label,
	pct,
	resetsAt,
	groups,
}: {
	label: string
	pct: number
	resetsAt: string | null
	groups: { key: string; name: string; color: string; pct: number }[]
}) {
	return (
		<div className='flex flex-col gap-2'>
			<div className='flex flex-wrap items-baseline gap-x-2'>
				<Num value={pct} format={pctText} className='text-lg leading-none' />
				<span className='text-[11px] text-muted-foreground'>
					{label} · <ResetCountdown resetsAt={resetsAt} />
				</span>
			</div>
			<UsageBar pct={pct} />
			<GroupSplit groups={groups} />
		</div>
	)
}

/** One Anthropic account on a single line — who it is, both windows, spend.
 *  Several subscriptions stack into a list of these instead of repeating the
 *  whole card set per account. */
function AccountRow({ dash, now, pollDown }: { dash: DashboardDTO; now: number; pollDown: boolean }) {
	return (
		<div className='grid gap-x-5 gap-y-4 border-b py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_repeat(2,minmax(0,1fr))_minmax(0,0.7fr)]'>
			<div className='flex min-w-0 flex-col gap-1.5'>
				<span className='truncate text-sm'>{accountName(dash)}</span>
				<StatusLine dash={dash} now={now} pollDown={pollDown} />
			</div>
			<AccountWindow
				label='5h'
				pct={dash.fiveHourPct}
				resetsAt={dash.fiveHourResetsAt}
				groups={splitOf(dash, g => g.sessionBudgetPct)}
			/>
			<AccountWindow
				label='week'
				pct={dash.sevenDayPct}
				resetsAt={dash.sevenDayResetsAt}
				groups={splitOf(dash, g => g.weeklyBudgetPct)}
			/>
			<div className='flex flex-col gap-1.5'>
				<div className='flex flex-wrap items-baseline gap-x-2'>
					<Num value={dash.spend.week.costUsd} format={formatUsd} className='text-lg leading-none' />
					<span className='text-[11px] text-muted-foreground'>week</span>
				</div>
				<span className='text-[11px] text-muted-foreground tabular-nums'>
					<Num value={dash.spend.month.costUsd} format={formatUsd} /> month
				</span>
			</div>
		</div>
	)
}

/** Live cards for every Anthropic account the fleet reports on. One account
 *  renders the full headline strip; several collapse to one row each with a
 *  single merged group table, so the page keeps its height as accounts are
 *  added. Polls the whole set at once: /api/dashboard answers for all of them. */
export function LiveDashboard({ initial, setup }: { initial: DashboardDTO[]; setup: SetupState | null }) {
	const [dashes, setDashes] = useState<DashboardDTO[]>(initial)
	const [lastOk, setLastOk] = useState(() => Date.now())
	// `now` advances once a second (below) so the staleness check stays a pure
	// read of state during render, and reads 0 until the client owns the tree: the
	// server's clock is not the viewer's, so an age rendered into the SSR markup
	// hydrates into different text. 0 reads as "fresh", which a page that just
	// rendered is.
	const [clock, setClock] = useState(() => Date.now())
	const now = useMounted() ? clock : 0
	// Which group rows are expanded (groupId or "ungrouped").
	const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
	// Serialises polling: /api/dashboard scans the whole window, so a server
	// slower than POLL_MS would otherwise stack a new request every tick and add
	// load to something already struggling. One outstanding request at a time also
	// means responses can never land out of order.
	const inFlightRef = useRef(false)

	const toggleRow = useCallback((key: string) => {
		setExpanded(prev => {
			const next = new Set(prev)
			if (next.has(key)) {
				next.delete(key)
			} else {
				next.add(key)
			}
			return next
		})
	}, [])

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
					setDashes(all)
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
		const id = setInterval(refresh, POLL_MS)
		const ticker = setInterval(() => setClock(Date.now()), 1000)
		const onVisible = () => {
			if (document.visibilityState === 'visible') {
				refresh()
			}
		}
		document.addEventListener('visibilitychange', onVisible)
		return () => {
			clearInterval(id)
			clearInterval(ticker)
			document.removeEventListener('visibilitychange', onVisible)
		}
	}, [refresh])

	const pollDown = now - lastOk > 3 * POLL_MS
	const solo = dashes.length === 1 ? dashes[0] : undefined

	if (dashes.length === 0 || (solo && !solo.connected)) {
		return <SetupRail setup={setup} />
	}

	const footnote = (
		<p className='max-w-2xl text-[11px] text-muted-foreground'>
			Headline percentages are Claude&apos;s own account utilization. Per-group percentages are budget-relative:
			the group&apos;s usage against its equal slice of the limit, so 100% means it has eaten its slice.
			Unattributed is account usage no reporting device explains, shown as a plain account share.
		</p>
	)

	if (solo) {
		return (
			<div className='flex flex-col gap-5'>
				<StatusLine dash={solo} now={now} pollDown={pollDown} />

				<div className='grid gap-x-5 gap-y-6 border-y py-4 sm:grid-cols-4'>
					<LimitCell
						label='5-hour session'
						pct={solo.fiveHourPct}
						resetsAt={solo.fiveHourResetsAt}
						groups={splitOf(solo, g => g.sessionBudgetPct)}
					/>
					<LimitCell
						label='Weekly'
						pct={solo.sevenDayPct}
						resetsAt={solo.sevenDayResetsAt}
						groups={splitOf(solo, g => g.weeklyBudgetPct)}
					/>
					<SpendCell label='Spend, this week' period={solo.spend.week} />
					<SpendCell label='Spend, this month' period={solo.spend.month} />
				</div>

				{solo.modelLimits.length > 0 && (
					<Section title='Model limits'>
						{solo.modelLimits.map(m => (
							<ModelLimitRow key={`${m.model}-${m.window}`} limit={m} />
						))}
					</Section>
				)}

				<Section title='Groups'>
					<GroupTable groups={solo.groups} expanded={expanded} onToggle={toggleRow} />
				</Section>

				{footnote}
			</div>
		)
	}

	// A group can hold devices on two subscriptions, so it earns one row per
	// account it spends on — the percentages only mean anything against a limit.
	const rows: GroupRow[] = dashes.flatMap(d => d.groups.map(g => ({ ...g, account: accountName(d) })))

	return (
		<div className='flex flex-col gap-5'>
			<div className='border-y'>
				{dashes.map(d => (
					<AccountRow key={d.accountId ?? 'unidentified'} dash={d} now={now} pollDown={pollDown} />
				))}
			</div>

			{dashes.map(d =>
				d.modelLimits.length > 0 ? (
					<Section key={d.accountId ?? 'unidentified'} title={`Model limits · ${accountName(d)}`}>
						{d.modelLimits.map(m => (
							<ModelLimitRow key={`${m.model}-${m.window}`} limit={m} />
						))}
					</Section>
				) : null,
			)}

			<Section title='Groups'>
				<GroupTable groups={rows} expanded={expanded} onToggle={toggleRow} />
			</Section>

			{footnote}
		</div>
	)
}
