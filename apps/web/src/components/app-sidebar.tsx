import { useState } from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import {
	ChevronsUpDownIcon,
	CreditCardIcon,
	GaugeIcon,
	LayersIcon,
	MonitorSmartphoneIcon,
	Settings2Icon,
	ShieldIcon,
	SlashIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTranslations } from 'use-intl'
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

// `key` indexes common.nav, so a label never gets written twice. Kept literal
// (no widening annotation) so a typo fails the `t()` call at compile time.
const NAV = [
	{ href: '/dashboard', icon: GaugeIcon, key: 'dashboard' },
	{ href: '/groups', icon: LayersIcon, key: 'groups' },
	{ href: '/devices', icon: MonitorSmartphoneIcon, key: 'devices' },
	{ href: '/billing', icon: CreditCardIcon, key: 'billing' },
	{ href: '/settings', icon: Settings2Icon, key: 'settings' },
	// Rendered only for ADMIN_EMAILS accounts, but listed here unconditionally so
	// PageTitle can name the page it is on.
	{ href: '/admin', icon: ShieldIcon, key: 'admin' },
] as const satisfies { href: string; key: string; icon: LucideIcon }[]

/** The shell's single <h1>: the current section's name, derived from the route
 *  so pages don't each repeat their own title. */
export function PageTitle() {
	const t = useTranslations('common.nav')
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
			<h1 className='truncate font-heading font-medium'>{t(current?.key ?? 'dashboard')}</h1>
		</div>
	)
}

function NavUser({ email }: { email: string }) {
	const t = useTranslations('common.user')
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
					<span className='truncate text-xs text-muted-foreground'>{t('signedIn')}</span>
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
									description: t('signOutFailedHint'),
									priority: 'high',
									title: t('signOutFailed'),
								},
								loading: { title: t('signingOut') },
								success: { title: t('signedOut') },
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
					{t('signOut')}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export function AppSidebar({ email, isAdmin }: { email: string; isAdmin: boolean }) {
	const t = useTranslations('common')
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
								<span className='truncate text-xs text-muted-foreground'>{t('tagline')}</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<SidebarGroup>
					<SidebarGroupLabel>{t('nav.overview')}</SidebarGroupLabel>
					<SidebarGroupContent>
						<SidebarMenu>
							{NAV.filter(n => isAdmin || n.href !== '/admin').map(n => (
								<SidebarMenuItem key={n.href}>
									<SidebarMenuButton
										isActive={pathname.startsWith(n.href)}
										tooltip={t(`nav.${n.key}`)}
										render={<Link to={n.href} />}
									>
										<n.icon />
										<span>{t(`nav.${n.key}`)}</span>
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
