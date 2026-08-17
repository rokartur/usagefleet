// Screenshot fixture for the README images in .github/: the real dashboard
// components on invented data, with no auth and no database, so a capture can
// never show someone's actual usage. Dev-only — see the notFound below.
import { useEffect } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { AppSidebar, PageTitle } from '@/components/app-sidebar'
import { UsageExplorer } from '@/components/dashboard/UsageExplorer'
import { WindowHistory } from '@/components/dashboard/WindowHistory'
import { LiveDashboard } from '@/components/LiveDashboard'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { DashboardDTO, HistoryDTO, HistoryRow, LiveGroupUsage, WindowHistoryDTO } from '@/lib/data'
import type { ModelUsage, TokenTotals } from '@/lib/usage'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
// Anchored to the capture time: the status line, the reset countdowns and the
// explorer's "last 30 days" all read as stale if this drifts into the past.
const NOW = Math.floor(Date.now() / MIN) * MIN

const GROUPS = [
	{ color: '#6366f1', id: 'g-laptops', name: 'Laptops' },
	{ color: '#10b981', id: 'g-desktops', name: 'Work desktops' },
	{ color: '#f59e0b', id: 'g-server', name: 'Home server' },
]

/** Bucket split of one billable figure, with cache reads on top — roughly the
 *  ratios a real Claude Code day lands on. */
function totals(billable: number): TokenTotals {
	const inputTokens = Math.round(billable * 0.08)
	const outputTokens = Math.round(billable * 0.12)
	const cacheCreationTokens = billable - inputTokens - outputTokens
	const cacheReadTokens = Math.round(billable * 7.4)
	return {
		cacheCreationTokens,
		cacheReadTokens,
		inputTokens,
		outputTokens,
		totalTokens: billable + cacheReadTokens,
	}
}

const model = (id: string, label: string, billable: number): ModelUsage => ({
	billableTokens: billable,
	label,
	model: id,
	totals: totals(billable),
})

const group = (
	i: number,
	sessionPct: number,
	weeklyPct: number,
	sessionBillable: number,
	weeklyBillable: number,
	models: ModelUsage[],
	sessionModels: ModelUsage[],
): LiveGroupUsage => ({
	color: GROUPS[i].color,
	groupId: GROUPS[i].id,
	models,
	name: GROUPS[i].name,
	sessionBudgetPct: sessionPct,
	sessionModels,
	sessionTokens: sessionBillable,
	sessionTotalTokens: totals(sessionBillable).totalTokens,
	weeklyBudgetPct: weeklyPct,
	weeklyTokens: weeklyBillable,
	weeklyTotalTokens: totals(weeklyBillable).totalTokens,
})

const liveGroups: LiveGroupUsage[] = [
	group(
		0,
		78,
		61,
		412_000,
		3_240_000,
		[model('claude-opus-4-6', 'Opus 4.6', 2_180_000), model('claude-sonnet-4-6', 'Sonnet 4.6', 1_060_000)],
		[model('claude-opus-4-6', 'Opus 4.6', 301_000), model('claude-sonnet-4-6', 'Sonnet 4.6', 111_000)],
	),
	group(
		1,
		34,
		48,
		184_000,
		2_560_000,
		[model('claude-sonnet-4-6', 'Sonnet 4.6', 1_940_000), model('claude-haiku-4-5', 'Haiku 4.5', 620_000)],
		[model('claude-sonnet-4-6', 'Sonnet 4.6', 184_000)],
	),
	group(2, 9, 22, 47_000, 1_180_000, [model('claude-haiku-4-5', 'Haiku 4.5', 1_180_000)], []),
]

const spendPeriod = (billable: number, costUsd: number) => ({ costUsd, totals: totals(billable) })

const dashboard: DashboardDTO = {
	accountId: 'shots-account',
	accountLabel: null,
	connected: true,
	fiveHourPct: 41,
	fiveHourResetsAt: new Date(NOW + 2 * HOUR + 14 * MIN).toISOString(),
	groups: liveGroups,
	modelLimits: [
		{
			groups: liveGroups.map(g => ({
				budgetPct: g.weeklyBudgetPct,
				color: g.color,
				groupId: g.groupId,
				name: g.name,
				tokens: g.weeklyTokens,
			})),
			label: 'Opus',
			model: 'opus',
			pct: 52,
			resetsAt: new Date(NOW + 3 * DAY + 9 * HOUR).toISOString(),
			window: '7d',
		},
	],
	reportedAt: new Date(NOW - 42_000).toISOString(),
	sevenDayPct: 44,
	sevenDayResetsAt: new Date(NOW + 3 * DAY + 9 * HOUR).toISOString(),
	source: 'sub',
	spend: { month: spendPeriod(31_400_000, 128.35), week: spendPeriod(6_980_000, 31.62) },
}

/** A past window row: the account percentage split across the three groups. */
function pastWindow(startMs: number, endMs: number, accountPct: number, shares: number[], tokens: number) {
	return {
		accountPct,
		end: new Date(endMs).toISOString(),
		groups: GROUPS.map((g, i) => ({
			accountPct: Math.round(accountPct * shares[i]),
			color: g.color,
			groupId: g.id,
			name: g.name,
			tokens: Math.round(tokens * shares[i]),
		})),
		start: new Date(startMs).toISOString(),
		tokens,
	}
}

const windows: WindowHistoryDTO = {
	sessions: [
		pastWindow(NOW - 5 * HOUR, NOW, 63, [0.52, 0.33, 0.15], 1_240_000),
		pastWindow(NOW - 10 * HOUR, NOW - 5 * HOUR, 88, [0.61, 0.27, 0.12], 1_910_000),
		pastWindow(NOW - 15 * HOUR, NOW - 10 * HOUR, 24, [0.38, 0.44, 0.18], 520_000),
		pastWindow(NOW - 20 * HOUR, NOW - 15 * HOUR, 71, [0.49, 0.36, 0.15], 1_460_000),
	],
	weeks: [
		pastWindow(NOW - 7 * DAY, NOW, 44, [0.46, 0.36, 0.18], 6_980_000),
		pastWindow(NOW - 14 * DAY, NOW - 7 * DAY, 92, [0.55, 0.31, 0.14], 12_400_000),
		pastWindow(NOW - 21 * DAY, NOW - 14 * DAY, 67, [0.41, 0.39, 0.2], 8_900_000),
	],
}

const DEVICES = [
	{ groupId: 'g-laptops', id: 'd1', name: 'macbook-pro', revoked: false },
	{ groupId: 'g-laptops', id: 'd2', name: 'thinkpad', revoked: false },
	{ groupId: 'g-desktops', id: 'd3', name: 'studio', revoked: false },
	{ groupId: 'g-desktops', id: 'd4', name: 'win-tower', revoked: false },
	// A retired machine that still owns history — the explorer marks it.
	{ groupId: 'g-server', id: 'd5', name: 'nuc', revoked: true },
]
const MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5']
const SOURCES = ['cli', 'cli', 'desktop', 'pi']

/** 45 days of daily rows with a weekday rhythm — enough shape for the chart to
 *  look like a real account rather than noise. */
function historyRows(): HistoryRow[] {
	const rows: HistoryRow[] = []
	for (let d = 44; d >= 0; d--) {
		const date = new Date(NOW - d * DAY)
		const day = date.toISOString().slice(0, 10)
		const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6
		for (const [i, device] of DEVICES.entries()) {
			for (const [j, m] of MODELS.entries()) {
				// Deterministic pseudo-noise: no Math.random, so captures don't drift.
				const wave = 0.55 + 0.45 * Math.sin((d * 0.7 + i * 1.3 + j) * 1.1)
				const billable = Math.round((weekend ? 34_000 : 128_000) * wave * (j === 0 ? 1 : j === 1 ? 0.7 : 0.25))
				if (billable < 3000) {
					continue
				}
				const t = totals(billable)
				rows.push({
					cacheCreation1hTokens: 0,
					cacheCreation5mTokens: t.cacheCreationTokens,
					cacheCreationTokens: t.cacheCreationTokens,
					cacheReadTokens: t.cacheReadTokens,
					costUsd: +(billable / 1_000_000) * (j === 0 ? 21 : j === 1 ? 4.2 : 1.1),
					day,
					deviceId: device.id,
					groupId: device.groupId,
					inputTokens: t.inputTokens,
					model: m,
					outputTokens: t.outputTokens,
					source: SOURCES[(i + j) % SOURCES.length],
				})
			}
		}
	}
	return rows
}

const history: HistoryDTO = {
	devices: DEVICES,
	groups: GROUPS,
	rows: historyRows(),
}

export const Route = createFileRoute('/shots')({
	// A deployment must not serve a page of made-up numbers under its own domain.
	beforeLoad: () => {
		if (!import.meta.env.DEV) {
			throw notFound()
		}
	},
	component: ShotsPage,
})

function ShotsPage() {
	// LiveDashboard polls /api/dashboard every 5s and sends the page to /login on
	// a 401. Answer it locally so the rig survives longer than one poll.
	useEffect(() => {
		const real = window.fetch
		window.fetch = async (input, init) =>
			String(input).includes('/api/dashboard') ? Response.json([dashboard]) : real(input, init)
		return () => {
			window.fetch = real
		}
	}, [])

	// Same shell numbers as _dash.tsx, or the screenshots stop matching the app.
	return (
		<SidebarProvider className='mx-auto max-w-(--shell)' style={{ '--shell': '80rem' } as React.CSSProperties}>
			<AppSidebar email='you@example.com' isAdmin={false} />
			<SidebarInset>
				<header className='sticky top-0 z-10 flex h-14 shrink-0 items-center border-b bg-background/80 px-4 backdrop-blur md:px-6'>
					<div className='flex w-full max-w-5xl items-center gap-2'>
						<PageTitle />
					</div>
				</header>
				<div className='flex w-full max-w-5xl flex-1 flex-col gap-6 p-4 md:p-6'>
					<LiveDashboard initial={[dashboard]} setup={null} />
					<WindowHistory history={windows} />
					<UsageExplorer history={history} />
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
