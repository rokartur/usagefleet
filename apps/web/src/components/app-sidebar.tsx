import { useState } from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
	ChevronsUpDownIcon,
	CreditCardIcon,
	GaugeIcon,
	LayersIcon,
	MonitorSmartphoneIcon,
	Settings2Icon,
	SlashIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from '@/components/ui/sidebar'
import { toast } from '@/components/ui/toast'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { signOut } from '@/lib/auth-client'

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
	{ href: '/dashboard', icon: GaugeIcon, label: 'Dashboard' },
	{ href: '/groups', icon: LayersIcon, label: 'Groups' },
	{ href: '/devices', icon: MonitorSmartphoneIcon, label: 'Devices' },
	{ href: '/billing', icon: CreditCardIcon, label: 'Billing' },
	{ href: '/settings', icon: Settings2Icon, label: 'Settings' },
]

/** The shell's single <h1>: the current section's name, derived from the route
 *  so pages don't each repeat their own title. */
export function PageTitle() {
	const pathname = useRouterState({
		select: state => state.location.pathname,
	})
	const current = NAV.find(n => pathname.startsWith(n.href))
	return (
		<div className='flex min-w-0 items-center gap-2 text-sm'>
			<span className='hidden items-center gap-1.5 text-muted-foreground sm:inline-flex'>
				<UsageFleetMark className='size-3.5' />
				UsageFleet
			</span>
			<SlashIcon className='hidden size-3 text-muted-foreground/50 sm:inline' aria-hidden />
			<h1 className='truncate font-heading font-medium'>{current?.label ?? 'Dashboard'}</h1>
		</div>
	)
}

function NavUser({ email }: { email: string }) {
	const router = useRouter()
	const [pending, setPending] = useState(false)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				render={<SidebarMenuButton size='lg' className='data-[state=open]:bg-sidebar-accent' />}
			>
				<span
					className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-medium uppercase'
					aria-hidden
				>
					{email.slice(0, 2)}
				</span>
				<span className='grid flex-1 text-left text-sm leading-tight'>
					<span className='truncate font-medium'>{email}</span>
					<span className='truncate text-xs text-muted-foreground'>Signed in</span>
				</span>
				<ChevronsUpDownIcon className='ml-auto size-4' />
			</DropdownMenuTrigger>
			<DropdownMenuContent side='top' align='end' className='w-56'>
				<DropdownMenuItem
					disabled={pending}
					onClick={async () => {
						setPending(true)
						const request = (async () => {
							const result = await signOut()
							if (result.error) {
								throw new Error('Sign out failed')
							}
						})()
						try {
							await toast.promise(request, {
								error: {
									description: 'Please sign in again if your session remains active.',
									priority: 'high',
									title: "Couldn't sign out",
								},
								loading: { title: 'Signing out…' },
								success: { title: 'Signed out' },
							})
						} catch {
							// Keep the existing best-effort redirect; the toast reports the failure.
						} finally {
							await router.invalidate()
							await router.navigate({ to: '/login' })
							setPending(false)
						}
					}}
				>
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export function AppSidebar({ email }: { email: string }) {
	const pathname = useRouterState({
		select: state => state.location.pathname,
	})
	const { isMobile } = useSidebar()
	return (
		// Permanent column on desktop, in normal flow so the centred shell keeps it
		// beside the content. Mobile keeps the off-canvas sheet: 16rem of a phone
		// screen is not a nav, it's the whole screen.
		<Sidebar collapsible={isMobile ? 'offcanvas' : 'none'} className='sticky top-0 h-svh border-r'>
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton size='lg' render={<Link to='/dashboard' />}>
							<span
								className='flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground'
								aria-hidden
							>
								<UsageFleetMark className='size-5' />
							</span>
							<span className='grid flex-1 text-left leading-tight'>
								<span className='truncate font-heading font-medium'>UsageFleet</span>
								<span className='truncate text-xs text-muted-foreground'>
									Usage across groups and devices
								</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>Overview</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{NAV.map(n => (
								<SidebarMenuItem key={n.href}>
									<SidebarMenuButton
										isActive={pathname.startsWith(n.href)}
										tooltip={n.label}
										render={<Link to={n.href} />}
									>
										<n.icon />
										<span>{n.label}</span>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroupContent>
				</SidebarGroup>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<NavUser email={email} />
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	)
}
