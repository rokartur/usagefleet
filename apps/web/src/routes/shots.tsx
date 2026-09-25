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
import { dashboard, history, windows } from '@/lib/shots-fixture'

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
