// The dashboard as the phone layout shows it: the web app's own components on
// the /shots fixture, inside the providers they expect. Composed at 540px so
// Tailwind's breakpoints pick the stacked mobile layout; rendered at scale 2.
import { IntlProvider } from 'use-intl'
import { WindowHistory } from '@/components/dashboard/WindowHistory'
import { LiveDashboard } from '@/components/LiveDashboard'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { dashboard as fixture, windows as fixtureWindows } from '@/lib/shots-fixture'
import { MESSAGES } from '@/messages'
import './web.css'

export const DASHBOARD_WIDTH = 540

// The fixture groups machines; the videos pitch one subscription shared by a
// few people, so each group wears a first name instead.
const PEOPLE = ['Artur', 'Kuba', 'Ola']
const person = <G extends { name: string }>(group: G, i: number) => ({ ...group, name: PEOPLE[i] ?? group.name })
const dashboard = {
	...fixture,
	groups: fixture.groups.map(person),
	modelLimits: fixture.modelLimits.map(limit => ({ ...limit, groups: limit.groups.map(person) })),
}
const windows = {
	sessions: fixtureWindows.sessions.map(w => ({ ...w, groups: w.groups.map(person) })),
	weeks: fixtureWindows.weeks.map(w => ({ ...w, groups: w.groups.map(person) })),
}

export function Dashboard() {
	return (
		<IntlProvider locale='en' messages={MESSAGES.en} timeZone='UTC'>
			<TooltipProvider>
				<div
					className='dark bg-background font-sans text-foreground antialiased'
					style={{ width: DASHBOARD_WIDTH }}
				>
					{/* Same header as _dash.tsx; the sidebar is a sheet on phones, so none here. */}
					<header className='flex h-14 items-center border-b px-4'>
						<div className='flex items-center gap-2 text-sm'>
							<span className='inline-flex items-center gap-1.5 text-muted-foreground'>
								<UsageFleetMark className='size-3.5' />
								UsageFleet
							</span>
							<span className='text-muted-foreground/50'>/</span>
							<h1 className='font-heading font-medium'>Dashboard</h1>
						</div>
					</header>
					<div className='flex flex-col gap-6 p-4'>
						<LiveDashboard initial={[dashboard]} poll={false} setup={null} />
						<WindowHistory history={windows} />
					</div>
				</div>
			</TooltipProvider>
		</IntlProvider>
	)
}
