import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useLocale, useTranslations } from 'use-intl'
import { Badge } from '@/components/arc/badge/badge'
import { EmptyState } from '@/components/arc/empty-state/empty-state'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { overrun, Section } from '@/components/usage-ui'
import type { PastWindow, WindowHistoryDTO } from '@/lib/data'
import { formatPct, formatTokens } from '@/lib/format'
import { cn } from '@/lib/utils'

const KINDS = ['sessions', 'weeks'] as const
type Kind = (typeof KINDS)[number]

/** Rows on offer; the largest must not exceed `PAST_WINDOWS` in lib/data.ts. */
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

const groupKey = (groupId: string | null) => groupId ?? 'ungrouped'

/** Every group active in any shown window, busiest first, with its points of its
 *  own slice summed and at their worst across the windows that have a sample. */
function groupsOf(windows: PastWindow[]) {
	const groups = new Map<
		string,
		{ key: string; name: string; color: string; tokens: number; budgetSum: number; budgetPeak: number }
	>()
	for (const w of windows) {
		for (const g of w.groups) {
			const key = groupKey(g.groupId)
			const budget = g.budgetPct ?? 0
			const seen = groups.get(key)
			if (seen) {
				seen.tokens += g.tokens
				seen.budgetSum += budget
				seen.budgetPeak = Math.max(seen.budgetPeak, budget)
			} else {
				groups.set(key, {
					budgetPeak: budget,
					budgetSum: budget,
					color: g.color,
					key,
					name: g.name,
					tokens: g.tokens,
				})
			}
		}
	}
	return [...groups.values()].toSorted((a, b) => b.tokens - a.tokens)
}

/**
 * Past limit windows, newest first, one row each — the "how did last
 * session/week go" counterpart to the live card. Above them, each group against
 * its own slice over the shown windows. Each row's bar is the
 * account's peak on a fixed 0–100% track, cut into what each group
 * contributed (the reported utilization split by cost), so the segments sum
 * to the account figure beside it. Windows that closed before the collector
 * recorded a utilization sample have no bar and fall back to tokens.
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
	const measured = windows.flatMap(w => (w.accountPct === null ? [] : [w.accountPct]))
	const average = measured.length > 0 ? measured.reduce((s, p) => s + p, 0) / measured.length : null
	const kindLabel = { sessions: t('windowsSessions'), weeks: t('windowsWeeks') }

	return (
		<Section
			title={account ? t('pastWindowsFor', { account }) : t('pastWindows')}
			actions={
				<div className='flex flex-wrap items-center gap-3'>
					<Tooltip content={t('betaHint')}>
						<Badge tabIndex={0}>{t('beta')}</Badge>
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
					{measured.length > 0 && <SliceSummary groups={groupsOf(windows)} windowCount={measured.length} />}
					{average !== null && (
						<p className='mb-2 flex items-center gap-1.5 text-xs text-muted-foreground'>
							<span className='h-3 border-l border-dashed border-muted-foreground' aria-hidden />
							{t('averagePeak', { pct: formatPct(average) })}
						</p>
					)}
					<table className='w-full table-fixed border-collapse text-sm tabular-nums'>
						<caption className='sr-only'>{t('pastWindows')}</caption>
						<thead className='text-xs text-muted-foreground'>
							<tr>
								<th scope='col' className='w-28 pb-1 text-left font-normal sm:w-40'>
									{t('windowUtc')}
								</th>
								<th scope='col' className='pb-1 text-left font-normal'>
									{t('accountLimit')}
								</th>
								<th scope='col' className='w-14 pb-1 text-right font-normal'>
									<span className='sr-only'>{t('accountLimit')}</span>
								</th>
								<th scope='col' className='w-16 pb-1 text-right font-normal max-sm:hidden'>
									{t('tokens')}
								</th>
							</tr>
						</thead>
						<tbody>
							{windows.map(w => (
								<tr key={w.start}>
									<td className='py-1 pr-3 text-xs text-(--text-secondary)'>
										{windowLabel(w, kind)}
									</td>
									<td className='py-1'>
										{w.accountPct === null ? (
											<span className='text-xs text-muted-foreground'>{t('noLimitSample')}</span>
										) : (
											<WindowBar window={w} average={average} />
										)}
									</td>
									<td
										className={cn(
											'py-1 text-right font-medium',
											w.accountPct !== null && overrun(w.accountPct),
										)}
									>
										{w.accountPct === null ? '' : formatPct(w.accountPct)}
									</td>
									<td className='py-1 text-right text-xs text-muted-foreground max-sm:hidden'>
										{formatTokens(w.tokens)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</>
			)}
		</Section>
	)
}

/** The account's peak on a 0–100% track, one segment per group; the tooltip and the label read out the split. */
function WindowBar({ window: w, average }: { window: PastWindow; average: number | null }) {
	const split = w.groups.flatMap(g => (g.accountPct === null ? [] : [{ ...g, accountPct: g.accountPct }]))
	const readout = split.map(g => `${g.name} ${formatPct(g.accountPct)}`).join(', ')
	return (
		<Tooltip
			content={
				<ul className='grid gap-1'>
					{split.map(g => (
						<li key={groupKey(g.groupId)} className='flex items-center gap-2 tabular-nums'>
							<span className='size-2 rounded-full' style={{ backgroundColor: g.color }} aria-hidden />
							<span className='min-w-0 flex-1 truncate'>{g.name}</span>
							<span className='font-medium'>{formatPct(g.accountPct)}</span>
						</li>
					))}
				</ul>
			}
		>
			<span className='relative flex h-3.5 overflow-hidden rounded-[3px] bg-(--surface-muted)'>
				<span className='sr-only'>{readout}</span>
				{split.map(g => (
					<span
						key={groupKey(g.groupId)}
						className='h-full shrink-0'
						style={{ backgroundColor: g.color, width: `${g.accountPct}%` }}
						aria-hidden
					/>
				))}
				{average !== null && (
					<span
						className='absolute inset-y-0 border-l border-dashed border-foreground/60'
						style={{ left: `${Math.min(100, average)}%` }}
						aria-hidden
					/>
				)}
			</span>
		</Tooltip>
	)
}

/** Track end: twice the slice, so the slice line sits mid-track and an overrun has room to show. */
const SLICE_TRACK_MAX = 200

/** One row per group against its own slice over the shown windows: the bar is the
 *  average, the tick the worst window, the solid line 100% of the slice. */
function SliceSummary({ groups, windowCount }: { groups: ReturnType<typeof groupsOf>; windowCount: number }) {
	const t = useTranslations('dash.overview')
	const at = (pct: number) => `${(Math.min(SLICE_TRACK_MAX, pct) / SLICE_TRACK_MAX) * 100}%`
	return (
		<table className='mb-5 w-full table-fixed border-collapse text-sm tabular-nums'>
			<caption className='sr-only'>{t('sliceSummary')}</caption>
			<thead className='text-xs text-muted-foreground'>
				<tr>
					<th scope='col' className='w-28 pb-1 text-left font-normal sm:w-40'>
						{t('groups')}
					</th>
					<th scope='col' className='pb-1 text-left font-normal'>
						<abbr title={t('sliceHint')} className='no-underline'>
							{t('sliceUsed')}
						</abbr>
					</th>
					<th scope='col' className='w-14 pb-1 text-right font-normal'>
						{t('sliceAverage')}
					</th>
					<th scope='col' className='w-16 pb-1 text-right font-normal max-sm:hidden'>
						{t('sliceWorst')}
					</th>
				</tr>
			</thead>
			<tbody>
				{groups.map(g => {
					const average = g.budgetSum / windowCount
					return (
						<tr key={g.key}>
							<th
								scope='row'
								className='truncate py-1 pr-3 text-left text-xs font-normal before:mr-1.5 before:inline-block before:size-2 before:rounded-full before:bg-(--dot)'
								style={{ '--dot': g.color } as CSSProperties}
							>
								{g.name}
							</th>
							<td className='py-1'>
								<span className='sr-only'>
									{formatPct(average)}, {t('sliceWorst')} {formatPct(g.budgetPeak)}
								</span>
								<span className='relative flex h-3.5 rounded-[3px] bg-(--surface-muted)' aria-hidden>
									<span
										className='my-1 rounded-[2px]'
										style={{ backgroundColor: g.color, width: at(average) }}
									/>
									<span
										className='absolute inset-y-0.5 border-l-2 border-muted-foreground'
										style={{ left: at(g.budgetPeak) }}
									/>
									<span className='absolute -inset-y-0.5 left-1/2 border-l-2 border-foreground' />
								</span>
							</td>
							<td className={cn('py-1 text-right font-medium', overrun(average))}>
								{formatPct(average)}
							</td>
							<td
								className={cn(
									'py-1 text-right text-xs text-muted-foreground max-sm:hidden',
									overrun(g.budgetPeak),
								)}
							>
								{formatPct(g.budgetPeak)}
							</td>
						</tr>
					)
				})}
			</tbody>
		</table>
	)
}
