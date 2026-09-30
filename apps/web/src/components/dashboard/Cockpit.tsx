import { useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { useTranslations } from 'use-intl'
import { ProjectTable } from '@/components/dashboard/ProjectTable'
import { UsageExplorer } from '@/components/dashboard/UsageExplorer'
import { WindowHistory } from '@/components/dashboard/WindowHistory'
import { accountKey, LiveDashboard } from '@/components/LiveDashboard'
import type { SetupState } from '@/components/LiveDashboard'
import type { DashboardDTO, WindowHistoryDTO } from '@/lib/data'

/** The dashboard layout: the live column for one account stays put on the left
 *  while the analysis scrolls on the right; below lg it stacks. The page owns
 *  which account is shown so both columns follow the same one. Shared by the
 *  user's dashboard and the admin's view of it. */
export function Cockpit({
	accounts,
	history,
	projects,
	setup,
	poll,
	readOnly,
	notConnected,
}: {
	accounts: { dash: DashboardDTO; windows: WindowHistoryDTO }[]
	history: ComponentProps<typeof UsageExplorer>['history']
	projects: ComponentProps<typeof ProjectTable>['projects']
	setup: SetupState | null
	poll?: boolean
	readOnly?: boolean
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
			{/* Past windows only show up once the account has closed one. */}
			{windows && (windows.sessions.length > 0 || windows.weeks.length > 0) && (
				<WindowHistory
					history={windows}
					account={accounts.length > 1 ? (current.dash.accountLabel ?? t('unidentifiedAccount')) : undefined}
				/>
			)}
			{history.rows.length > 0 && <UsageExplorer history={history} />}
			{projects.length > 0 && <ProjectTable projects={projects} readOnly={readOnly} />}
		</>
	)

	// Nothing has reported limits yet: the setup rail needs the full width, and
	// whatever usage already arrived stacks under it.
	if (!accounts.some(a => a.dash.connected)) {
		return (
			<div className='flex flex-col gap-10'>
				{notConnected ?? live}
				{analysis}
			</div>
		)
	}

	return (
		<div className='grid gap-10 lg:grid-cols-[21rem_minmax(0,1fr)] lg:gap-0'>
			<aside className='lg:sticky lg:top-18 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto lg:border-r lg:pr-6'>
				{live}
			</aside>
			<div className='flex min-w-0 flex-col gap-10 lg:pl-6'>{analysis}</div>
		</div>
	)
}
