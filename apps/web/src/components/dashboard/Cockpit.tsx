import { useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslations } from 'use-intl'
import { UsageExplorer } from '@/components/dashboard/UsageExplorer'
import { WindowHistory } from '@/components/dashboard/WindowHistory'
import { accountKey, LiveDashboard } from '@/components/LiveDashboard'
import type { SetupState } from '@/components/LiveDashboard'
import type { DashboardDTO, WindowHistoryDTO } from '@/lib/data'

/** The dashboard layout: the live section for one account on top, the analysis
 *  under it. The page owns which account is shown so both follow the same one.
 *  Shared by the user's dashboard and the admin's view of it. */
export function Cockpit({
	accounts,
	history,
	setup,
	poll,
	notConnected,
}: {
	accounts: { dash: DashboardDTO; windows: WindowHistoryDTO }[]
	history: ComponentProps<typeof UsageExplorer>['history']
	setup: SetupState | null
	poll?: boolean
	/** Shown in place of the setup rail while no account has reported limits. */
	notConnected?: ReactNode
}) {
	const t = useTranslations('dash.overview')
	const [selected, setSelected] = useState<string | null>(null)
	const current = accounts.find(a => accountKey(a.dash) === selected) ?? accounts[0]
	const windows = current?.windows

	const live = (
		<LiveDashboard
			initial={accounts.map(a => a.dash)}
			setup={setup}
			selected={selected}
			onSelect={setSelected}
			poll={poll}
		/>
	)
	const analysis = (
		<>
			{history.rows.length > 0 && <UsageExplorer history={history} />}
			{/* Past windows only show up once the account has closed one. */}
			{windows && ((current.dash.hasFiveHour && windows.sessions.length > 0) || windows.weeks.length > 0) && (
				<WindowHistory
					history={windows}
					hasFiveHour={current.dash.hasFiveHour}
					account={accounts.length > 1 ? (current.dash.accountLabel ?? t('unidentifiedAccount')) : undefined}
				/>
			)}
		</>
	)

	// Nothing has reported limits yet: the setup rail takes the top, and whatever
	// usage already arrived stacks under it.
	const connected = accounts.some(a => a.dash.connected)
	return (
		<div className='flex flex-col gap-6'>
			{connected ? live : (notConnected ?? live)}
			{analysis}
		</div>
	)
}
