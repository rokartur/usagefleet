import { useState } from 'react'
import { useLocale, useTranslations } from 'use-intl'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { SortableDataTable } from '@/components/arc/sortable-data-table/sortable-data-table'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { overrun, Section, UsageBar } from '@/components/usage-ui'
import type { PastWindow, WindowHistoryDTO } from '@/lib/data'
import { formatPct, formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'

const KINDS = ['sessions', 'weeks'] as const
type Kind = (typeof KINDS)[number]

/** Chart columns on offer; the largest must not exceed `PAST_WINDOWS` in lib/data.ts. */
const WINDOW_COUNTS = ['4', '8', '16'] as const
type WindowCount = (typeof WINDOW_COUNTS)[number]

/** "Feb 12, 10:00–15:00" for a session, "Feb 5 – Feb 12" for a week.
 *
 *  Pinned to UTC in every locale: these are the boundaries Anthropic's own
 *  windows use, so rendering them in the viewer's zone would shift the label
 *  off the window it names. */
function useWindowLabel(): (w: PastWindow, kind: Kind) => string {
	const locale = useLocale()
	const dayFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
	const timeFmt = new Intl.DateTimeFormat(locale, {
		hour: '2-digit',
		hourCycle: 'h23',
		minute: '2-digit',
		timeZone: 'UTC',
	})
	return (w, kind) => {
		const start = new Date(w.start)
		const end = new Date(w.end)
		return kind === 'sessions'
			? `${dayFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`
			: `${dayFmt.format(start)} – ${dayFmt.format(end)}`
	}
}

const columnKey = (groupId: string | null) => groupId ?? 'ungrouped'

/** One column per group that was active in any shown window, busiest first. */
function columnsOf(windows: PastWindow[]) {
	const cols = new Map<string, { key: string; name: string; color: string; tokens: number }>()
	for (const w of windows) {
		for (const g of w.groups) {
			const cur = cols.get(columnKey(g.groupId))
			if (cur) {
				cur.tokens += g.tokens
			} else {
				cols.set(columnKey(g.groupId), {
					color: g.color,
					key: columnKey(g.groupId),
					name: g.name,
					tokens: g.tokens,
				})
			}
		}
	}
	return [...cols.values()].toSorted((a, b) => b.tokens - a.tokens)
}

/**
 * Past limit windows, group by group — the "how did last session/week go"
 * counterpart to the live card. Every percentage is a share of the whole
 * account limit: the utilization Claude reported for that window, split across
 * groups by cost, so the group cells sum to the account column. Only that
 * column carries a bar, since group shares are already measured against it.
 * Windows that closed before the collector recorded a utilization sample have
 * no percentage anywhere and fall back to tokens.
 *
 * `account` names the subscription the windows belong to, and is passed only
 * when the fleet reports on more than one.
 */
export function WindowHistory({ history, account }: { history: WindowHistoryDTO; account?: string }) {
	const t = useTranslations('dash.overview')
	const windowLabel = useWindowLabel()
	const [kind, setKind] = useState<Kind>('sessions')
	const [count, setCount] = useState<WindowCount>('8')
	const windows = history[kind].slice(0, Number(count))
	const columns = columnsOf(windows)
	const kindLabel = { sessions: t('windowsSessions'), weeks: t('windowsWeeks') }

	return (
		<Section
			title={account ? t('pastWindowsFor', { account }) : t('pastWindows')}
			actions={
				<div className='flex flex-wrap items-center gap-3'>
					<Tooltip content={t('betaHint')}>
						<button
							type='button'
							className='text-xs text-muted-foreground underline decoration-dotted underline-offset-4'
						>
							{t('beta')}
						</button>
					</Tooltip>
					<SegmentedControl
						label={t('window')}
						value={kind}
						onValueChange={setKind}
						options={KINDS.map(k => ({ label: kindLabel[k], value: k }))}
					/>
					<SegmentedControl
						label={t('windowCount')}
						value={count}
						onValueChange={setCount}
						options={WINDOW_COUNTS.map(n => ({ label: n, value: n }))}
					/>
				</div>
			}
		>
			{windows.length === 0 ? (
				<EmptyState
					title={t('historyEmptyTitle')}
					description={t('historyEmptyDescription', {
						window: kind === 'sessions' ? t('fiveHour') : t('weekly'),
					})}
				/>
			) : (
				<>
					<WindowChart windows={windows} kind={kind} columns={Number(count)} />
					<details className='mt-4 text-sm'>
						<summary className='w-max cursor-pointer text-muted-foreground hover:text-foreground'>
							{t('table')}
						</summary>
						<SortableDataTable
							caption={t('table')}
							rows={windows.map(w => ({
								accountPct: w.accountPct,
								start: w.start,
								tokens: w.tokens,
								window: w,
							}))}
							rowKey='start'
							columns={[
								{
									key: 'start',
									label: t('windowUtc'),
									render: (_, row) => (
										<span className='font-medium whitespace-nowrap'>
											{windowLabel(row.window, kind)}
										</span>
									),
									sortable: true,
								},
								{
									key: 'accountPct',
									label: t('accountLimit'),
									render: (_, row) =>
										row.accountPct === null ? (
											<span className='text-muted-foreground'>{t('noLimitSample')}</span>
										) : (
											<span className='flex min-w-36 items-center gap-3'>
												<UsageBar pct={row.accountPct} className='w-24 shrink-0' />
												<span
													className={cn('font-medium tabular-nums', overrun(row.accountPct))}
												>
													{formatPct(row.accountPct)}
												</span>
											</span>
										),
									sortable: true,
								},
								{
									key: 'tokens',
									label: t('tokens'),
									numeric: true,
									render: (_, row) => formatTokens(row.tokens),
									sortable: true,
								},
								...columns.map(c => ({
									key: c.key,
									label: c.name,
									numeric: true,
									render: (_: unknown, row: { window: PastWindow }) => {
										const g = row.window.groups.find(x => columnKey(x.groupId) === c.key)
										return g && g.accountPct !== null ? (
											<span className={cn('font-medium', overrun(g.accountPct))}>
												{formatPct(g.accountPct)}
											</span>
										) : (
											<span className='text-muted-foreground'>
												{g ? formatTokens(g.tokens) : '—'}
											</span>
										)
									},
								})),
							]}
						/>
					</details>
				</>
			)}
		</Section>
	)
}

/** Arc's bar chart anatomy: one column per window, oldest on the left, against
 *  a 0–100% scale in the right gutter with the average dashed across. Each bar
 *  is the account's peak cut into what each group contributed. A window with no
 *  limit sample gets a short hatched stub so the gap reads as missing data.
 *  Always `columns` wide, padded on the left, so few windows don't stretch. */
function WindowChart({ windows, kind, columns }: { windows: PastWindow[]; kind: Kind; columns: number }) {
	const t = useTranslations('dash.overview')
	const locale = useLocale()
	const label = useWindowLabel()
	const short = new Intl.DateTimeFormat(
		locale,
		kind === 'sessions'
			? { hour: '2-digit', hourCycle: 'h23', minute: '2-digit', timeZone: 'UTC', weekday: 'short' }
			: { day: 'numeric', month: 'short', timeZone: 'UTC' },
	)
	const shown = windows.toReversed()
	const padding = Array.from({ length: columns - shown.length }, (_, i) => `empty-${i}`)
	const sampled = windows.flatMap(w => (w.accountPct === null ? [] : [Math.min(100, w.accountPct)]))
	const average = sampled.length > 0 ? Math.round(sampled.reduce((sum, pct) => sum + pct, 0) / sampled.length) : null
	const grid = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
	// A tick label makes way where the average label sits beside it.
	const ticks = [0, 50, 100].filter(tick => average === null || Math.abs(tick - average) > 12)

	return (
		<figure aria-hidden className='m-0 grid gap-5'>
			{average !== null && (
				<div className='grid gap-0.5'>
					<span className='text-sm text-(--text-secondary)'>{t('average')}</span>
					<span className='flex items-baseline gap-1.5 font-(family-name:--font-display) text-3xl leading-(--leading-display) font-medium tracking-(--tracking-display) tabular-nums'>
						{average}
						<span className='font-(family-name:--font-body) text-base font-normal tracking-(--tracking-body) text-(--text-secondary)'>
							%
						</span>
					</span>
				</div>
			)}
			<div className='grid grid-cols-[minmax(0,1fr)_52px] grid-rows-[auto_26px]'>
				{/* The top inset leaves room for the label over a full bar. */}
				<div className='relative h-40'>
					<div className='absolute inset-x-0 top-4 bottom-0'>
						{[50, 100].map(tick => (
							<span key={tick} className='absolute inset-x-0 border-t' style={{ bottom: `${tick}%` }} />
						))}
						{average !== null && (
							<span
								className='absolute inset-x-0 border-t border-dashed border-(--text-secondary)'
								style={{ bottom: `${average}%` }}
							/>
						)}
						<div
							className='absolute inset-0 grid items-end gap-1.5 border-b border-(--border-strong)'
							style={grid}
						>
							{padding.map(key => (
								<span key={key} />
							))}
							{shown.map(w => (
								<div
									key={w.start}
									title={`${label(w, kind)} UTC · ${w.accountPct === null ? t('noLimitSample') : formatPct(w.accountPct)}`}
									className='relative mx-auto flex h-full w-full max-w-[28px] flex-col justify-end'
								>
									<span
										className={cn(
											'absolute inset-x-[-1rem] mb-1 text-center text-xs leading-none text-(--text-muted) tabular-nums',
											w.accountPct !== null && overrun(w.accountPct),
										)}
										style={{ bottom: `${Math.min(100, w.accountPct ?? 4)}%` }}
									>
										{w.accountPct === null ? 'n/a' : formatPct(w.accountPct)}
									</span>
									{w.accountPct === null ? (
										<div className='h-[4%] rounded-t-[4px] bg-[repeating-linear-gradient(135deg,var(--color-muted)_0_3px,transparent_3px_6px)]' />
									) : (
										<div
											className='flex flex-col-reverse gap-px overflow-hidden rounded-t-[4px]'
											style={{ height: `${Math.min(100, w.accountPct)}%` }}
										>
											{w.groups.map(g => (
												<div
													key={g.groupId ?? 'ungrouped'}
													style={{ backgroundColor: g.color, flexGrow: g.accountPct ?? 0 }}
												/>
											))}
										</div>
									)}
								</div>
							))}
						</div>
					</div>
				</div>
				<div className='relative'>
					<div className='absolute inset-x-0 top-4 bottom-0'>
						{ticks.map(tick => (
							<span
								key={tick}
								className='absolute left-2.5 translate-y-1/2 text-xs leading-none text-(--text-muted) tabular-nums'
								style={{ bottom: `${tick}%` }}
							>
								{tick}%
							</span>
						))}
						{average !== null && (
							<span
								className='absolute left-2.5 translate-y-1/2 text-xs leading-none font-medium tabular-nums'
								style={{ bottom: `${average}%` }}
							>
								{average}%
							</span>
						)}
					</div>
				</div>
				<div className='grid gap-1.5 pt-2' style={grid}>
					{padding.map(key => (
						<span key={key} />
					))}
					{shown.map(w => (
						<span key={w.start} className='truncate text-center text-xs leading-none text-(--text-muted)'>
							{short.format(new Date(w.start))}
						</span>
					))}
				</div>
			</div>
		</figure>
	)
}
