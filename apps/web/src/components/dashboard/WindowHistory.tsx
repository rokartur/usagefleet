import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Section, UsageBar } from '@/components/usage-ui'
import type { PastWindow, WindowHistoryDTO } from '@/lib/data'
import { formatTokens } from '@/lib/format'

const KINDS = [
	{ key: 'sessions', label: '5-hour sessions' },
	{ key: 'weeks', label: 'Weeks' },
] as const
type Kind = (typeof KINDS)[number]['key']

const dayFmt = new Intl.DateTimeFormat('en-US', {
	day: 'numeric',
	month: 'short',
	timeZone: 'UTC',
})
const timeFmt = new Intl.DateTimeFormat('en-US', {
	hour: '2-digit',
	hourCycle: 'h23',
	minute: '2-digit',
	timeZone: 'UTC',
})

/** "Feb 12, 10:00–15:00" for a session, "Feb 5 – Feb 12" for a week (UTC). */
function windowLabel(w: PastWindow, kind: Kind): string {
	const start = new Date(w.start)
	const end = new Date(w.end)
	return kind === 'sessions'
		? `${dayFmt.format(start)}, ${timeFmt.format(start)}–${timeFmt.format(end)}`
		: `${dayFmt.format(start)} – ${dayFmt.format(end)}`
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
	const [kind, setKind] = useState<Kind>('sessions')
	const windows = history[kind]
	const columns = columnsOf(windows)

	return (
		<Section
			title={account ? `Past windows · ${account}` : 'Past windows'}
			actions={
				<div className='flex flex-wrap items-center gap-2'>
					<Tooltip>
						<TooltipTrigger render={<Badge variant='outline' className='font-normal' />}>
							Beta
						</TooltipTrigger>
						<TooltipContent>
							Window history is new: it reconstructs closed windows from the samples the collector
							happened to record, so a window that nobody reported during reads as tokens only.
						</TooltipContent>
					</Tooltip>
					<Select
						value={kind}
						onValueChange={v => {
							if (v) {
								setKind(v)
							}
						}}
						items={KINDS.map(k => ({ label: k.label, value: k.key }))}
					>
						<SelectTrigger size='sm' aria-label='Window'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{KINDS.map(k => (
								<SelectItem key={k.key} value={k.key}>
									{k.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			}
		>
			{windows.length === 0 ? (
				<Empty className='border'>
					<EmptyHeader>
						<EmptyTitle>Nothing behind us yet</EmptyTitle>
						<EmptyDescription>
							No completed {kind === 'sessions' ? '5-hour' : 'weekly'} window has any recorded activity.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Window (UTC)</TableHead>
							<TableHead>Account limit</TableHead>
							<TableHead className='text-right'>Tokens</TableHead>
							{columns.map(c => (
								<TableHead key={c.key} className='text-right'>
									<span className='inline-flex items-center gap-2'>
										<span
											className='size-2.5 shrink-0 rounded-full'
											style={{ backgroundColor: c.color }}
											aria-hidden
										/>
										{c.name}
									</span>
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{windows.map(w => (
							<TableRow key={w.start}>
								<TableCell className='font-medium whitespace-nowrap'>{windowLabel(w, kind)}</TableCell>
								<TableCell>
									{w.accountPct === null ? (
										<span className='text-muted-foreground'>no limit sample</span>
									) : (
										<span className='flex min-w-36 items-center gap-3'>
											<UsageBar pct={w.accountPct} className='w-24 shrink-0' />
											<span className='font-medium tabular-nums'>{w.accountPct}%</span>
										</span>
									)}
								</TableCell>
								<TableCell className='text-right tabular-nums'>{formatTokens(w.tokens)}</TableCell>
								{columns.map(c => {
									const g = w.groups.find(x => columnKey(x.groupId) === c.key)
									return (
										<TableCell key={c.key} className='text-right tabular-nums'>
											{g && g.accountPct !== null ? (
												<span className='font-medium'>{g.accountPct}%</span>
											) : (
												<span className='text-muted-foreground'>
													{g ? formatTokens(g.tokens) : '—'}
												</span>
											)}
										</TableCell>
									)
								})}
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</Section>
	)
}
