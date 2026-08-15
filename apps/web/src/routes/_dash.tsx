import { createFileRoute, Outlet } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { AppSidebar, PageTitle } from '@/components/app-sidebar'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { requireUser } from '@/lib/session'

/** Guards every dashboard route and hands the shell what it needs. Throwing the
 *  redirect from here (via requireUser) stops the child loaders from running. */
const dashShell = createServerFn().handler(async () => {
	const user = await requireUser()
	return { email: user.email }
})

export const Route = createFileRoute('/_dash')({
	loader: () => dashShell(),
	component: DashLayout,
})

/** Sidebar (16rem) plus the content column (56rem): the shell is centred at this
 *  width so the sidebar sits next to the content, not at the viewport edge. */
const SHELL = { '--shell': '72rem' } as React.CSSProperties

const COLUMN = 'flex w-full max-w-4xl'

function DashLayout() {
	const { email } = Route.useLoaderData()
	return (
		<SidebarProvider className='mx-auto max-w-(--shell)' style={SHELL}>
			<AppSidebar email={email} />
			<SidebarInset>
				{/* Header and content share one centred column so the page title lines
            up with the cards below it. */}
				<header className='sticky top-0 z-10 flex h-14 shrink-0 items-center border-b bg-background/80 px-4 backdrop-blur md:px-6'>
					<div className={`${COLUMN} items-center gap-2`}>
						{/* The sidebar is permanent on desktop; only the mobile sheet needs a trigger. */}
						<SidebarTrigger className='-ml-1 md:hidden' />
						<PageTitle />
					</div>
				</header>
				<div className={`${COLUMN} flex-1 flex-col gap-6 p-4 md:p-6`}>
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	)
}
