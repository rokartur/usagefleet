import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckIcon } from 'lucide-react'
import { GroupTable } from '@/components/dashboard/GroupTable'
import { InstallCommand } from '@/components/InstallCommand'
import { ResetCountdown } from '@/components/ResetCountdown'
import { Button } from '@/components/ui/button'
import { Section, UsageBar } from '@/components/usage-ui'
import type { DashboardDTO, LiveGroupUsage, ModelLimitDTO, SpendPeriod } from '@/lib/data'
import { formatRelative, formatTokens, formatUsd } from '@/lib/format'
import { TOKEN_PLACEHOLDER } from '@/lib/install-command'
import { billableTokens, LIMITS_STALE_MS } from '@/lib/usage'
import { cn } from '@/lib/utils'

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
					<span className='text-foreground tabular-nums'>{g.pct}%</span>
				</span>
			))}
		</div>
	)
}

const groupKey = (groupId: string | null) => groupId ?? 'ungrouped'

/** One column of the headline strip: label, one big number, detail underneath. */
function StatCell({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
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
		<StatCell label={label} value={`${Math.min(100, pct)}%`}>
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
		<StatCell label={label} value={formatUsd(period.costUsd)}>
			<div className='text-[11px] text-muted-foreground tabular-nums'>
				{formatTokens(billableTokens(period.totals))} billable · {formatTokens(period.totals.totalTokens)} total
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
			<span className='tabular-nums'>{Math.min(100, limit.pct)}%</span>
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

export function LiveDashboard({ initial, setup }: { initial: DashboardDTO; setup: SetupState | null }) {
	const [dash, setDash] = useState<DashboardDTO>(initial)
	const [lastOk, setLastOk] = useState(() => Date.now())
	// `now` advances once a second (below) so the staleness check stays a pure
	// read of state during render.
	const [now, setNow] = useState(() => Date.now())
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
				setDash((await res.json()) as DashboardDTO)
				setLastOk(Date.now())
			}
		} catch {
			/* transient network/abort — keep last good data; staleness shows below */
		} finally {
			inFlightRef.current = false
		}
	}, [])

	useEffect(() => {
		const id = setInterval(refresh, POLL_MS)
		const ticker = setInterval(() => setNow(Date.now()), 1000)
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
	const reportAge = dash.reportedAt ? now - Date.parse(dash.reportedAt) : 0
	const stale = pollDown || reportAge > LIMITS_STALE_MS
	const statusLabel = pollDown ? 'reconnecting…' : stale ? 'collector offline' : 'live'

	if (!dash.connected) {
		return <SetupRail setup={setup} />
	}

	const sourceLabel = dash.source === 'sub' ? 'subscription' : dash.source === 'api' ? 'API key' : '—'
	const split = (pct: (g: LiveGroupUsage) => number) =>
		dash.groups.map(g => ({
			color: g.color,
			key: groupKey(g.groupId),
			name: g.name,
			pct: pct(g),
		}))

	return (
		<div className='flex flex-col gap-5'>
			<p className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground'>
				<span className={cn('size-1.5 rounded-full', stale ? 'bg-amber-500' : 'bg-emerald-500')} aria-hidden />
				<span className={stale ? 'text-amber-500' : 'text-foreground'}>{statusLabel}</span>· {sourceLabel}
				{dash.reportedAt ? ` · updated ${formatRelative(new Date(dash.reportedAt))}` : ''}
			</p>

			<div className='grid gap-x-5 gap-y-6 border-y py-4 sm:grid-cols-4'>
				<LimitCell
					label='5-hour session'
					pct={dash.fiveHourPct}
					resetsAt={dash.fiveHourResetsAt}
					groups={split(g => g.sessionBudgetPct)}
				/>
				<LimitCell
					label='Weekly'
					pct={dash.sevenDayPct}
					resetsAt={dash.sevenDayResetsAt}
					groups={split(g => g.weeklyBudgetPct)}
				/>
				<SpendCell label='Spend, this week' period={dash.spend.week} />
				<SpendCell label='Spend, this month' period={dash.spend.month} />
			</div>

			{dash.modelLimits.length > 0 && (
				<Section title='Model limits'>
					{dash.modelLimits.map(m => (
						<ModelLimitRow key={`${m.model}-${m.window}`} limit={m} />
					))}
				</Section>
			)}

			<Section title='Groups'>
				<GroupTable groups={dash.groups} expanded={expanded} onToggle={toggleRow} />
			</Section>

			<p className='max-w-2xl text-[11px] text-muted-foreground'>
				Headline percentages are Claude&apos;s own account utilization. Per-group percentages are
				budget-relative: the group&apos;s usage against its equal slice of the limit, so 100% means it has eaten
				its slice.
			</p>
		</div>
	)
}
