import type { ReactNode } from 'react'
import { useState } from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, MonitorSmartphone, PanelLeft, ShieldCheck, UserRound } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useTranslations } from 'use-intl'
import { Breadcrumb } from '@/components/arc/breadcrumb/breadcrumb'
import { Drawer, DrawerContent, DrawerTrigger } from '@/components/arc/drawer/drawer'
import { useToast } from '@/components/arc/toast-stack/toast-stack'
import { Tooltip } from '@/components/arc/tooltip/tooltip'
import { UserMenu } from '@/components/arc/user-menu/user-menu'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { signOut } from '@/lib/auth-client'

// `key` indexes common.nav, so a label never gets written twice. Kept literal
// (no widening annotation) so a typo fails the `t()` call at compile time.
const NAV = [
	{ href: '/dashboard', key: 'dashboard', Icon: LayoutDashboard },
	{ href: '/fleet', key: 'fleet', Icon: MonitorSmartphone },
	{ href: '/account', key: 'account', Icon: UserRound },
	// Rendered only for ADMIN_EMAILS accounts, but listed here unconditionally so
	// the breadcrumb can name the page it is on.
	{ href: '/admin', key: 'admin', Icon: ShieldCheck },
] as const satisfies { href: string; key: string; Icon: LucideIcon }[]

const railLink =
	'grid size-[32px] place-items-center rounded-[8px] text-(--text-muted) transition-colors duration-(--duration-fast) ease-(--ease-standard) hover:bg-(--surface-muted) hover:text-foreground data-[status=active]:bg-(--surface-muted) data-[status=active]:text-foreground motion-reduce:transition-none'
const sheetLink =
	'flex h-[40px] items-center gap-[10px] rounded-[8px] px-[10px] text-base text-(--text-secondary) data-[status=active]:bg-(--surface-muted) data-[status=active]:text-foreground'

/** Arc's app rail: icons on the left from md up, a breadcrumb on top, and the
 *  same links in a sheet from the left edge on phones. */
export function AppShell({ email, isAdmin, children }: { email: string; isAdmin: boolean; children: ReactNode }) {
	const t = useTranslations('common')
	const pathname = useRouterState({ select: state => state.location.pathname })
	const [sheetOpen, setSheetOpen] = useState(false)
	const links = NAV.filter(n => isAdmin || n.href !== '/admin')
	const page = t(`nav.${NAV.find(n => pathname.startsWith(n.href))?.key ?? 'dashboard'}`)

	return (
		<div className='md:flex'>
			<aside className='sticky top-0 hidden h-dvh w-[56px] shrink-0 flex-col items-center gap-[12px] border-r py-[12px] md:flex'>
				<Link
					to='/dashboard'
					aria-label='UsageFleet'
					className='grid size-[32px] place-items-center rounded-[8px] bg-foreground text-background'
				>
					<UsageFleetMark className='size-[16px]' />
				</Link>
				<span className='h-px w-[24px] bg-(--border)' aria-hidden />
				<nav aria-label={t('nav.label')} className='flex flex-col gap-[4px]'>
					{links.map(({ href, key, Icon }) => (
						<Tooltip key={href} content={t(`nav.${key}`)} side='right'>
							<Link to={href} aria-label={t(`nav.${key}`)} className={railLink}>
								<Icon size={16} strokeWidth={1.75} aria-hidden />
							</Link>
						</Tooltip>
					))}
				</nav>
				<div className='mt-auto border-t pt-[12px]'>
					<AccountMenu email={email} />
				</div>
			</aside>
			<div className='min-w-0 flex-1'>
				<header className='sticky top-0 z-20 flex h-13 items-center gap-[10px] border-b bg-background/85 px-4 backdrop-blur md:px-6'>
					<Drawer open={sheetOpen} onOpenChange={setSheetOpen} swipeDirection='left'>
						<DrawerTrigger
							aria-label={t('nav.open')}
							className='-ml-[6px] grid size-[32px] place-items-center rounded-[8px] text-(--text-muted) hover:bg-(--surface-muted) hover:text-foreground md:hidden'
						>
							<PanelLeft size={16} strokeWidth={1.75} aria-hidden />
						</DrawerTrigger>
						<DrawerContent title='UsageFleet' className='w-[min(18rem,calc(100vw-var(--space-4)))]'>
							<nav aria-label={t('nav.label')} className='flex flex-col gap-[2px]'>
								{links.map(({ href, key, Icon }) => (
									<Link
										key={href}
										to={href}
										className={sheetLink}
										onClick={() => setSheetOpen(false)}
									>
										<Icon size={18} strokeWidth={1.75} aria-hidden />
										{t(`nav.${key}`)}
									</Link>
								))}
							</nav>
						</DrawerContent>
					</Drawer>
					<h1 className='sr-only'>{page}</h1>
					<Breadcrumb
						ariaLabel={t('nav.breadcrumb')}
						items={[{ label: 'UsageFleet', href: '/dashboard' }, { label: page }]}
					/>
					<div className='ml-auto md:hidden'>
						<AccountMenu email={email} />
					</div>
				</header>
				<main className='flex flex-col gap-6 p-4 md:p-6'>{children}</main>
			</div>
		</div>
	)
}

function AccountMenu({ email }: { email: string }) {
	const t = useTranslations('common')
	const router = useRouter()
	const toast = useToast()
	const { theme, setTheme } = useTheme()

	async function signOutAndLeave() {
		const request = (async () => {
			const result = await signOut()
			if (result.error) {
				throw new Error('Sign out failed')
			}
		})()
		try {
			await toast.promise(request, {
				error: { description: t('user.signOutFailedHint'), title: t('user.signOutFailed') },
				loading: { title: t('user.signingOut') },
				success: { title: t('user.signedOut') },
			})
		} catch {
			// Keep the existing best-effort redirect; the toast reports the failure.
		} finally {
			await router.invalidate()
			await router.navigate({ to: '/login' })
		}
	}

	return (
		<UserMenu
			user={{ name: email, email }}
			theme={theme === 'light' || theme === 'dark' ? theme : 'system'}
			onThemeChange={setTheme}
			onSignOut={signOutAndLeave}
			messages={{
				menu: name => t('user.menu', { name }),
				signOut: t('user.signOut'),
				signingOut: t('user.signingOut'),
				theme: t('theme.label'),
				themes: { dark: t('theme.dark'), light: t('theme.light'), system: t('theme.system') },
			}}
		/>
	)
}
