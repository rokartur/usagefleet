import { useState } from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { signOut } from '@/lib/auth-client'

// `key` indexes common.nav, so a label never gets written twice. Kept literal
// (no widening annotation) so a typo fails the `t()` call at compile time.
const NAV = [
	{ href: '/dashboard', key: 'dashboard' },
	{ href: '/fleet', key: 'fleet' },
	{ href: '/account', key: 'account' },
	// Rendered only for ADMIN_EMAILS accounts, but listed here unconditionally so
	// PageTitle can name the page it is on.
	{ href: '/admin', key: 'admin' },
] as const satisfies { href: string; key: string }[]

/** The shell's single <h1>: the tabs already show where you are, so it is for
 *  screen readers only. */
export function PageTitle() {
	const t = useTranslations('common.nav')
	const pathname = useRouterState({ select: state => state.location.pathname })
	const current = NAV.find(n => pathname.startsWith(n.href))
	return <h1 className='sr-only'>{t(current?.key ?? 'dashboard')}</h1>
}

function UserMenu({ email }: { email: string }) {
	const t = useTranslations('common.user')
	const router = useRouter()
	const [pending, setPending] = useState(false)
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				aria-label={email}
				className='flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium uppercase outline-none focus-visible:ring-3 focus-visible:ring-ring/50'
			>
				{email.slice(0, 2)}
			</DropdownMenuTrigger>
			<DropdownMenuContent align='end' className='w-56'>
				<DropdownMenuGroup>
					<DropdownMenuLabel className='truncate'>{email}</DropdownMenuLabel>
				</DropdownMenuGroup>
				<DropdownMenuSeparator />
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

export function AppTopbar({ email, isAdmin }: { email: string; isAdmin: boolean }) {
	const t = useTranslations('common')
	return (
		<header className='sticky top-0 z-20 h-12 border-b bg-background/85 backdrop-blur'>
			<div className='flex h-full items-center gap-5 px-4 sm:gap-7 md:px-6'>
				<Link
					to='/dashboard'
					className='flex items-center gap-2 font-heading font-medium'
					aria-label='UsageFleet'
				>
					<UsageFleetMark className='size-4.5' />
					<span className='hidden sm:inline'>UsageFleet</span>
				</Link>
				<nav aria-label={t('nav.label')} className='flex h-full gap-5'>
					{NAV.filter(n => isAdmin || n.href !== '/admin').map(n => (
						<Link
							key={n.href}
							to={n.href}
							className='-mb-px flex items-center border-b-2 border-transparent text-sm text-muted-foreground transition-colors hover:text-foreground data-[status=active]:border-foreground data-[status=active]:text-foreground'
						>
							{t(`nav.${n.key}`)}
						</Link>
					))}
				</nav>
				<div className='ml-auto'>
					<UserMenu email={email} />
				</div>
			</div>
		</header>
	)
}
