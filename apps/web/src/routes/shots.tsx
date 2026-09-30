// Screenshot fixture for the README images in .github/: the real dashboard
// components on invented data, with no auth and no database, so a capture can
// never show someone's actual usage. Dev-only — see the notFound below.
import { useEffect } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { AppTopbar } from '@/components/app-topbar'
import { Cockpit } from '@/components/dashboard/Cockpit'
import { dashboard, history, projects, windows } from '@/lib/shots-fixture'

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

	// Same shell as _dash.tsx, or the screenshots stop matching the app.
	return (
		<>
			<AppTopbar email='you@example.com' isAdmin={false} />
			<main className='mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 md:p-6'>
				<Cockpit accounts={[{ dash: dashboard, windows }]} history={history} projects={projects} setup={null} />
			</main>
		</>
	)
}
