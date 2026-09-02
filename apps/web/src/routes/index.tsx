import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ArrowRight, Check, Copy } from 'lucide-react'
import type { Variants } from 'motion/react'
import { motion, MotionConfig, useScroll, useTransform } from 'motion/react'
import { createTranslator, useLocale, useTranslations } from 'use-intl'
import { OrbitMark } from '@/components/orbit-mark'
import { SiteFooter } from '@/components/site-footer'
import { buttonVariants } from '@/components/ui/button'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { detectLocale, LOCALE_CURRENCY } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'
import { formatPlanPrice, FREE_DEVICES, PLANS, planPriceCents } from '@/lib/plans'
import type { PaidPlan, PlanPrices } from '@/lib/plans'
import { getSession } from '@/lib/session'
import { PACKAGE_URL, REPO_URL, SITE_NAME, siteUrl } from '@/lib/site'
import { planPrices } from '@/lib/stripe-prices'
import { cn } from '@/lib/utils'
import { MESSAGES } from '@/messages'

// The marketing page stays public for everyone; a signed-in visitor just gets
// app links instead of sign-in links. Session lives in a cookie, so this has to
// be resolved on the server — as do the prices, which come from Stripe.
const landing = createServerFn().handler(async () => {
	const [session, prices] = await Promise.all([getSession(), planPrices(LOCALE_CURRENCY[detectLocale()])])
	return { signedIn: Boolean(session), prices }
})

/** The questions that decide whether someone installs it, answered in the same
 *  words the collector uses. Every one of these is a real invariant, not copy.
 *  Message keys rather than text, because the markup and the structured data
 *  both render them and the page has two languages to render them in. */
const FAQ = ['apiKey', 'prompts', 'split', 'downgrade', 'guard'] as const

// Under 60 characters so Google shows it whole, and leading with the words a
// search for this product actually contains rather than with the brand alone.
const title = (locale: Locale) => `${MESSAGES[locale].landing.meta.title} — ${SITE_NAME}`

export const Route = createFileRoute('/')({
	loader: () => landing(),
	head: ({ loaderData }) => {
		const url = `${siteUrl()}/`
		const locale = detectLocale()
		const description = MESSAGES[locale].common.siteDescription
		// The markup below reads these through React; the structured data has no
		// component around it, so it gets its own translator over the same messages.
		const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: 'landing' })
		const pageTitle = title(locale)
		// Offers need the Stripe prices, which only exist once the loader has run;
		// on a client-side navigation the page is already indexed, so skip them.
		const offered = loaderData
			? [...pricingTiers(loaderData.prices, locale), customTier(loaderData.prices, locale)]
			: []
		return {
			meta: [
				{ title: pageTitle },
				{ name: 'description', content: description },
				{ property: 'og:title', content: pageTitle },
				{ property: 'og:description', content: description },
				{ property: 'og:url', content: url },
				{ name: 'twitter:title', content: pageTitle },
				{ name: 'twitter:description', content: description },
			],
			links: [{ rel: 'canonical', href: url }],
			// Structured data: the only page a crawler can reach, so it carries the
			// product description and the price list rendered below.
			scripts: [
				{
					type: 'application/ld+json',
					children: JSON.stringify({
						'@context': 'https://schema.org',
						'@type': 'SoftwareApplication',
						name: SITE_NAME,
						url,
						description,
						applicationCategory: 'DeveloperApplication',
						operatingSystem: 'macOS, Linux, Windows',
						sameAs: [REPO_URL, PACKAGE_URL],
						// The same tiers the pricing section renders, so the two can't
						// disagree. Custom is quoted at its entry price, hence "from".
						offers: offered.map(tier => ({
							'@type': 'Offer',
							name: tier.plan,
							price: (tier.priceCents / 100).toFixed(2),
							priceCurrency: (loaderData?.prices.currency ?? 'usd').toUpperCase(),
							description: `${tier.id === 'custom' ? t('meta.offerFrom') : ''}${t('meta.offerDevices', {
								count: tier.devices,
							})}`,
						})),
					}),
				},
				// The FAQ section, in the shape Google reads. Same source array as the
				// markup below, so an answer can't be edited in one place only.
				{
					type: 'application/ld+json',
					children: JSON.stringify({
						'@context': 'https://schema.org',
						'@type': 'FAQPage',
						mainEntity: FAQ.map(key => ({
							'@type': 'Question',
							name: t(`faq.${key}Q`),
							acceptedAnswer: { '@type': 'Answer', text: t(`faq.${key}A`) },
						})),
					}),
				},
			],
		}
	},
	component: Landing,
})

/** Illustrative dashboard row: what one account's groups look like mid window.
 *  `tokens` is in millions so the account row can add it up instead of carrying
 *  a hardcoded sum that goes stale the moment these numbers are edited. */
const EXAMPLE_GROUPS = [
	// Hexes are straight out of lib/group-colors, so the mockup can only show a
	// dot a real group could actually be wearing.
	{ name: 'laptops', color: '#6366f1', devices: 3, session: 62, weekly: 41, tokens: 4.2 },
	{ name: 'workDesktops', color: '#10b981', devices: 2, session: 23, weekly: 18, tokens: 1.6 },
	{ name: 'homeServer', color: '#f59e0b', devices: 1, session: 9, weekly: 6, tokens: 0.5 },
] as const

const millions = (value: number) => `${value.toFixed(1)}M`

/** One published package, whichever manager the machine already has. npm goes
 *  first: it ships with the Node the collector needs anyway. */
const INSTALL_COMMANDS = {
	npm: 'npm i -g @usagefleet/cli',
	bun: 'bun add -g @usagefleet/cli',
	pnpm: 'pnpm add -g @usagefleet/cli',
} as const

type PackageManager = keyof typeof INSTALL_COMMANDS

const MANAGERS = Object.keys(INSTALL_COMMANDS) as PackageManager[]

/** Three commands, in the order you type them. `<token>` stays a placeholder:
 *  the real one is generated per device on the Devices page. Only the number
 *  and the command are fixed; the prose is a message key. */
const STEPS = [
	{ n: '01', key: 'install', command: INSTALL_COMMANDS.npm },
	{ n: '02', key: 'pair', command: 'usagefleet login <token>' },
	{ n: '03', key: 'leave', command: 'usagefleet status' },
] as const

// The label stays English: it is the machine-side vocabulary, same as the
// commands above. Keep `privacy` in step with the collector payload
// (apps/cli/src/types.ts): it also uploads cwd, git branch, hostname, model
// and session id.
const SPECS = ['source', 'split', 'privacy'] as const

/** Max groups always equals the plan's device cap, so one number drives both
 *  rows. `highlight` marks the tier the columns lean on. */
// Device count is the only thing a subscription actually gates (see plans.ts),
// so every perk line below has to be something all tiers really get. `id` is
// what the CTA carries through sign-in so /billing can preselect the plan.
interface Tier {
	id: PaidPlan | null
	plan: string
	note: string
	price: string
	period: string | null
	/** Entry price in cents, for the structured-data offer. */
	priceCents: number
	devices: number
	highlight: boolean
}

// Plan names stay as they are: Free, Solo, Fleet and Custom are what the
// billing page, Stripe and the support inbox all call them.
function pricingTiers(prices: PlanPrices, locale: Locale): Tier[] {
	const m = MESSAGES[locale].landing.pricing
	return [
		{
			id: null,
			plan: 'Free',
			note: m.notes.free,
			// Zero still goes through the formatter: "$0" is only right in one of
			// the two currencies this page can be priced in.
			price: formatPlanPrice(0, prices, locale),
			period: null,
			priceCents: 0,
			devices: FREE_DEVICES,
			highlight: false,
		},
		{
			id: 'solo',
			plan: PLANS.solo.label,
			note: m.notes.solo,
			price: formatPlanPrice(prices.amounts.solo, prices, locale),
			period: m.perMonth,
			priceCents: prices.amounts.solo,
			devices: PLANS.solo.devices,
			highlight: true,
		},
		{
			id: 'fleet',
			plan: PLANS.fleet.label,
			note: m.notes.fleet,
			price: formatPlanPrice(prices.amounts.fleet, prices, locale),
			period: m.perMonth,
			priceCents: prices.amounts.fleet,
			devices: PLANS.fleet.devices,
			highlight: false,
		},
	]
}

/** Priced per device rather than by tier: `devices` and `price` here are the
 *  floor, not the whole offer. */
function customTier(prices: PlanPrices, locale: Locale): Tier {
	const m = MESSAGES[locale].landing.pricing
	return {
		id: 'custom',
		plan: PLANS.custom.label,
		note: m.notes.custom,
		price: formatPlanPrice(prices.amounts.custom, prices, locale),
		period: m.perDevicePerMonth,
		priceCents: planPriceCents('custom', PLANS.custom.minDevices, prices),
		devices: PLANS.custom.minDevices,
		highlight: false,
	}
}

const sums = EXAMPLE_GROUPS.reduce(
	(sum, g) => ({
		devices: sum.devices + g.devices,
		session: sum.session + g.session,
		weekly: sum.weekly + g.weekly,
		tokens: sum.tokens + g.tokens,
	}),
	{ devices: 0, session: 0, weekly: 0, tokens: 0 },
)

/** Devices and tokens add up, percentages do not: a group's percentage is
 *  measured against its own 1/N slice of the account, so each one contributes
 *  only 1/N of the account figure and the account row is their mean. Summing
 *  them would show 94% for an account actually sitting at 31%. */
const account = {
	...sums,
	session: Math.round(sums.session / EXAMPLE_GROUPS.length),
	weekly: Math.round(sums.weekly / EXAMPLE_GROUPS.length),
}

// ─── Motion language ─────────────────────────────────────────────────────────
// One curve, one gesture: everything rises a little and resolves out of a short
// blur. Blocks that arrive together do it in sequence rather than all at once.

/** Fast out of the gate, long tail. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** Fires once, slightly before the block reaches the fold. */
const VIEWPORT = { once: true, margin: '-80px' } as const

/** Standalone block. `custom` carries the delay, because a variant's own
 *  transition beats the `transition` prop. */
const RISE: Variants = {
	hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
	visible: (delay = 0) => ({
		opacity: 1,
		y: 0,
		filter: 'blur(0px)',
		transition: { duration: 0.6, ease: EASE_OUT, delay },
	}),
}

/** Same gesture for a stagger child. No delay of its own: the parent's stagger
 *  supplies it, and an explicit one here would overwrite it. */
const RISE_ITEM: Variants = {
	hidden: { opacity: 0, y: 24, filter: 'blur(8px)' },
	visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: EASE_OUT } },
}

const STAGGER: Variants = {
	hidden: {},
	visible: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
}

/** Numbers arrive digit by digit, each rising inside its own clipped box. */
const ROLL_CHAR: Variants = {
	hidden: { y: '110%', opacity: 0, filter: 'blur(4px)' },
	visible: { y: '0%', opacity: 1, filter: 'blur(0px)', transition: { duration: 0.5, ease: EASE_OUT } },
}

function Landing() {
	const { signedIn, prices } = Route.useLoaderData()
	const locale = useLocale()
	const t = useTranslations('landing')
	const tiers = [...pricingTiers(prices, locale), customTier(prices, locale)]
	const appHref = signedIn ? '/dashboard' : '/login'
	const appLabel = signedIn ? t('nav.app') : t('primaryCta.getStarted')

	const heroRef = useRef<HTMLElement>(null)
	const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
	const heroY = useTransform(scrollYProgress, [0, 1], [0, -28])
	const heroOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.5])

	return (
		// reducedMotion='user' is the whole accessibility story for this page:
		// motion drops the transforms and keeps the fades when the OS asks it to.
		<MotionConfig reducedMotion='user'>
			{/* Every reveal starts at opacity 0, which without scripting would be a
			    blank page rather than a subtle one. */}
			<noscript>
				<style>
					{
						'[data-reveal],[data-reveal] *{opacity:1!important;transform:none!important;filter:none!important}'
					}
				</style>
			</noscript>

			<div className='flex-1 bg-background text-foreground'>
				{/* Pinned and full bleed: the CTA and the section links stay one click
				    away for the whole page, and the rule under it runs edge to edge so
				    the content reads as passing beneath. */}
				<header className='sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md'>
					<div className='mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6'>
						<a
							href='#top'
							className='flex items-center gap-2 font-semibold tracking-tight transition-opacity hover:opacity-70'
						>
							<UsageFleetMark className='size-5' />
							UsageFleet
						</a>
						<nav className='hidden gap-7 text-sm text-muted-foreground sm:flex'>
							<a href='#how' className='transition-colors hover:text-foreground'>
								{t('nav.how')}
							</a>
							<a href='#pricing' className='transition-colors hover:text-foreground'>
								{t('nav.pricing')}
							</a>
							<a href='#faq' className='transition-colors hover:text-foreground'>
								{t('nav.faq')}
							</a>
						</nav>
						<Link to={appHref} className={buttonVariants()}>
							{signedIn ? t('nav.app') : t('nav.signIn')}
						</Link>
					</div>
				</header>

				<div className='mx-auto w-full max-w-7xl px-6'>
					{/* isolate, so the mark's -z-10 lands behind the hero copy and not
					    behind the page background, where it would vanish. */}
					<section id='top' ref={heroRef} className='relative isolate pt-16 sm:pt-24'>
						{/* Out of flow and behind the copy: decorative, and the only thing on
						    the page that repaints every frame, so a phone skips it. */}
						<motion.div
							className='absolute right-0 bottom-0 -z-10 hidden lg:block'
							initial={{ opacity: 0, filter: 'blur(10px)' }}
							animate={{ opacity: 1, filter: 'blur(0px)' }}
							transition={{ delay: 0.24, duration: 1, ease: EASE_OUT }}
						>
							<OrbitMark className='w-[210px]' />
						</motion.div>
						{/* The copy drifts up and dims as the page scrolls past it, so the
						    dashboard below arrives into a settled frame. */}
						<motion.div style={{ y: heroY, opacity: heroOpacity }}>
							{/* One line from the small breakpoint up: the clamp is sized so the
							    32 characters still clear the container at its 1280px cap. */}
							<h1 className='text-[clamp(1.6rem,4.1vw,3.75rem)] leading-[1] font-semibold tracking-[-0.045em]'>
								{/* Word by word out of a blur: the one piece of choreography on
								    the page, and it only plays once, on load. */}
								<Word delay={0.06}>{t('hero.headline.one')}</Word>{' '}
								<Word delay={0.16}>{t('hero.headline.subscription')}</Word>{' '}
								<Word delay={0.26} className='text-muted-foreground'>
									{t('hero.headline.many')}
								</Word>{' '}
								<Word delay={0.34} className='text-muted-foreground'>
									{t('hero.headline.machines')}
								</Word>
							</h1>
							<motion.p
								className='mt-6 text-[15px] text-muted-foreground'
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.44, duration: 0.45, ease: EASE_OUT }}
							>
								{t('hero.lead')}
							</motion.p>
							<motion.div
								className='mt-8 flex flex-wrap items-center gap-3'
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.56, duration: 0.45, ease: EASE_OUT }}
							>
								<PrimaryCta to={appHref} label={appLabel} />
								<InstallPicker />
							</motion.div>
							<motion.ul
								className='mt-5 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11.5px] text-muted-foreground/70'
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.72, duration: 0.5, ease: EASE_OUT }}
							>
								{(['setup', 'prompts'] as const).map(badge => (
									<li
										key={badge}
										className='flex items-center gap-2 before:size-[3px] before:rounded-full before:bg-current'
									>
										{t(`hero.badges.${badge}`)}
									</li>
								))}
							</motion.ul>
						</motion.div>
					</section>

					<Reveal className='mt-12'>
						<DashboardMockup />
					</Reveal>

					<section id='how' className='scroll-mt-20 border-t border-border py-20'>
						<SectionHead
							title={
								<>
									{t('how.title')}
									<br />
									<span className='text-muted-foreground'>{t('how.titleSecond')}</span>
								</>
							}
							lead={t('how.lead')}
						/>
						{/* bg-border showing through the gap is what draws the hairline. */}
						<div className='overflow-hidden rounded-xl border border-border bg-border'>
							<Stagger className='grid gap-px sm:grid-cols-3'>
								{STEPS.map(step => (
									<motion.div
										key={step.n}
										data-reveal
										variants={RISE_ITEM}
										className='bg-background px-5 py-6 transition-colors hover:bg-muted/40'
									>
										<span className='font-mono text-[11px] text-muted-foreground/70'>{step.n}</span>
										<h3 className='mt-3.5 text-lg font-medium tracking-tight'>
											{t(`how.steps.${step.key}.title`)}
										</h3>
										<p className='mt-2.5 text-sm leading-relaxed text-muted-foreground'>
											{t(`how.steps.${step.key}.body`)}
										</p>
										<code className='mt-3.5 block overflow-x-auto font-mono text-xs whitespace-nowrap text-muted-foreground/70'>
											{step.command}
										</code>
									</motion.div>
								))}
							</Stagger>
							{/* What the collector actually does, in the same panel as the setup
							    steps: it is the same story, and it did not need a heading of its
							    own to say so. */}
							<Stagger className='grid gap-px'>
								{SPECS.map(spec => (
									<motion.div
										key={spec}
										data-reveal
										variants={RISE_ITEM}
										className='grid gap-x-7 gap-y-1 bg-background px-5 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[90px_1fr]'
									>
										<span className='font-mono text-xs text-muted-foreground/70'>{spec}</span>
										<p className='text-sm leading-relaxed text-muted-foreground'>
											<span className='font-medium text-foreground'>
												{t(`how.specs.${spec}.title`)}.
											</span>{' '}
											{t(`how.specs.${spec}.body`)}
										</p>
									</motion.div>
								))}
							</Stagger>
						</div>
					</section>

					<section id='pricing' className='scroll-mt-20 border-t border-border py-20'>
						<SectionHead
							title={
								<>
									{t('pricing.title')}
									<br />
									<span className='text-muted-foreground'>{t('pricing.titleSecond')}</span>
								</>
							}
							lead={t('pricing.lead')}
						/>
						<div className='overflow-hidden rounded-xl border border-border bg-border'>
							{/* Custom rides in the grid as a fourth column instead of a stranded
							    row below it: same five lines as the rest, its price is just per
							    device. */}
							<Stagger className='grid gap-px sm:grid-cols-2 lg:grid-cols-4'>
								{tiers.map(tier => (
									<motion.div
										key={tier.plan}
										data-reveal
										variants={RISE_ITEM}
										// No fill on the recommended tier: its solid button already says
										// it, and a grey panel sitting there from the first paint reads
										// as a disabled card rather than the pick.
										className='flex flex-col gap-3.5 bg-background px-5 py-5 transition-colors hover:bg-muted/40'
									>
										<div className='flex items-baseline justify-between gap-2'>
											<span className='font-medium tracking-tight'>{tier.plan}</span>
											<span className='truncate font-mono text-[11px] text-muted-foreground/70'>
												{tier.note}
											</span>
										</div>
										<div className='flex items-baseline font-mono text-[2.1rem] leading-none tracking-[-0.045em]'>
											<RollIn text={tier.price} />
											{tier.period && (
												<span className='ml-1.5 text-[11px] tracking-normal text-muted-foreground/70'>
													{tier.period}
												</span>
											)}
										</div>
										<ul className='flex flex-col gap-1.5 text-sm text-muted-foreground'>
											<li>
												<b className='font-mono font-medium text-foreground'>{tier.devices}</b>
												{tier.id === 'custom' ? (
													<>
														{t('pricing.rangeTo')}
														<b className='font-mono font-medium text-foreground'>
															{PLANS.custom.maxDevices}
														</b>
													</>
												) : null}{' '}
												{/* Custom shows a range, so the noun has to agree with the
												    number the reader ends on, not with the floor. */}
												{t('pricing.devices', {
													count:
														tier.id === 'custom' ? PLANS.custom.maxDevices : tier.devices,
												})}
											</li>
											<li>
												{tier.id === 'custom' ? (
													t('pricing.asManyGroups')
												) : (
													<>
														<b className='font-mono font-medium text-foreground'>
															{tier.devices}
														</b>{' '}
														{t('pricing.groups', { count: tier.devices })}
													</>
												)}
											</li>
										</ul>
										{/* /login drops ?plan= for anyone already signed in, so send
										    them straight to the page that acts on it. */}
										<Link
											to={signedIn ? '/billing' : '/login'}
											search={tier.id ? { plan: tier.id } : {}}
											className={buttonVariants({
												variant: tier.highlight ? 'default' : 'outline',
												className: 'mt-auto w-full justify-center',
											})}
										>
											{tier.highlight
												? t('pricing.choose', { plan: tier.plan })
												: t('pricing.start', { plan: tier.plan })}
										</Link>
									</motion.div>
								))}
							</Stagger>

							{/* The plans differ in device and group count and nothing else, so
							    the shared half is stated once instead of as an "everything in the
							    tier below" chain up the columns. */}
							<Reveal className='mt-px flex flex-wrap items-baseline gap-x-6 gap-y-2 bg-background px-5 py-4'>
								<span className='font-mono text-[11px] text-muted-foreground/70'>
									{t('pricing.everyPlan')}
								</span>
								<span className='text-sm text-muted-foreground'>{t('pricing.everyPlanBody')}</span>
							</Reveal>
						</div>
					</section>

					<section id='faq' className='scroll-mt-20 border-t border-border py-20'>
						<SectionHead title={t('faq.title')} />
						<Stagger>
							{FAQ.map(key => (
								// <details> rather than an accordion component: it opens without
								// scripting and needs no state.
								<motion.details
									key={key}
									data-reveal
									variants={RISE_ITEM}
									className='group border-t border-border last:border-b'
								>
									<summary className='flex cursor-pointer list-none items-center justify-between gap-5 py-4.5 transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden'>
										{t(`faq.${key}Q`)}
										<span className='font-mono text-lg text-muted-foreground/70 group-open:hidden'>
											+
										</span>
										<span className='hidden font-mono text-lg text-muted-foreground/70 group-open:inline'>
											−
										</span>
									</summary>
									<p className='max-w-[68ch] pb-5 text-sm leading-relaxed text-muted-foreground'>
										{t(`faq.${key}A`)}
									</p>
								</motion.details>
							))}
						</Stagger>
					</section>

					<section className='border-t border-border py-20'>
						<Reveal className='flex flex-wrap items-center justify-between gap-5'>
							<h2 className='max-w-[20ch] text-3xl font-semibold tracking-[-0.03em]'>{t('cta.title')}</h2>
							<PrimaryCta to={appHref} label={appLabel} />
						</Reveal>
					</section>

					<SiteFooter />
				</div>
			</div>
		</MotionConfig>
	)
}

/** Scroll-in for one block. `once` so nothing re-animates on the way back up. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
	return (
		<motion.div
			data-reveal
			className={className}
			custom={delay}
			variants={RISE}
			initial='hidden'
			whileInView='visible'
			viewport={VIEWPORT}
		>
			{children}
		</motion.div>
	)
}

/** Container for a row/grid whose children each carry `variants={RISE_ITEM}`. */
function Stagger({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<motion.div className={className} variants={STAGGER} initial='hidden' whileInView='visible' viewport={VIEWPORT}>
			{children}
		</motion.div>
	)
}

/** One word of the headline, arriving out of a blur. */
function Word({ children, delay, className }: { children: string; delay: number; className?: string }) {
	return (
		<motion.span
			data-reveal
			className={`inline-block ${className ?? ''}`}
			initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
			animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
			transition={{ delay, duration: 1, ease: EASE_OUT }}
		>
			{children}
		</motion.span>
	)
}

/** Prices arrive digit by digit, each rising inside its own clipped box. The
 *  characters are decorative once split, so the whole number is the label. */
/** Text that rolls in character by character. Keyed remounts replay it, which
 *  is how the install command animates when the package manager changes: an
 *  element remounted inside the viewport fires whileInView straight away. */
function RollIn({ text, stagger = 0.045 }: { text: string; stagger?: number }) {
	return (
		// The trigger has to sit on the unclipped wrapper: a character parked below
		// its own overflow-hidden box has an empty intersection rect, so a
		// whileInView on it would never fire and the price would never appear.
		<motion.span
			data-reveal
			aria-label={text}
			variants={{ hidden: {}, visible: { transition: { staggerChildren: stagger } } }}
			initial='hidden'
			whileInView='visible'
			viewport={VIEWPORT}
			// Every character is its own inline-block, so without this the browser
			// happily breaks a line mid-word: "0,35 USD" wrapped after the "US".
			className='whitespace-nowrap'
		>
			{[...text].map((char, i) => (
				// No height: an inline-block is exactly one line box tall, which is the
				// clip we want. align-bottom because overflow-hidden moves the baseline.
				<span
					// biome-ignore lint/suspicious/noArrayIndexKey: position is the identity here
					key={`${char}-${i}`}
					aria-hidden
					className='inline-block overflow-hidden align-bottom'
				>
					<motion.span className='inline-block' variants={ROLL_CHAR}>
						{/* A collapsing space would eat the gaps between the words. */}
						{char === ' ' ? '\u00A0' : char}
					</motion.span>
				</span>
			))}
		</motion.span>
	)
}

const MotionLink = motion.create(Link)

/** The page's main call to action: on hover the label slides out through a
 *  blur and comes back with an arrow. */
function PrimaryCta({ to, label }: { to: '/dashboard' | '/login'; label: string }) {
	const [hover, setHover] = useState(false)
	const swap = { duration: 0.22, ease: EASE_OUT }
	return (
		<MotionLink
			to={to}
			onMouseEnter={() => setHover(true)}
			onMouseLeave={() => setHover(false)}
			whileHover={{ scale: 1.02 }}
			whileTap={{ scale: 0.98 }}
			// px-4 fits the label alone; the hover state adds an arrow and a gap on
			// top of it, and overflow-hidden would shave it off.
			className={buttonVariants({ size: 'lg', className: 'relative overflow-hidden px-6' })}
		>
			<motion.span
				animate={{ opacity: hover ? 0 : 1, x: hover ? -14 : 0, filter: hover ? 'blur(6px)' : 'blur(0px)' }}
				transition={swap}
			>
				{label}
			</motion.span>
			<motion.span
				className='absolute flex items-center gap-1.5'
				animate={{ opacity: hover ? 1 : 0, x: hover ? 0 : 14, filter: hover ? 'blur(0px)' : 'blur(6px)' }}
				transition={swap}
			>
				{label}
				<ArrowRight className='size-4' />
			</motion.span>
		</MotionLink>
	)
}

/** The install line, with the manager switchable in place. Server-renders npm,
 *  which is also the answer for anyone who never touches the tabs. */
function InstallPicker() {
	const t = useTranslations('landing.hero')
	const [manager, setManager] = useState<PackageManager>('npm')
	const [copied, setCopied] = useState(false)
	const command = INSTALL_COMMANDS[manager]

	// One timer, replaced on every copy and cleared on unmount, so an impatient
	// double click can't leave the tick stuck on.
	useEffect(() => {
		if (!copied) {
			return
		}
		const timer = setTimeout(() => setCopied(false), 1600)
		return () => clearTimeout(timer)
	}, [copied])

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(command)
			setCopied(true)
		} catch {
			// Clipboard denied or insecure origin: the command stays selectable text.
		}
	}

	return (
		<div
			className={`flex h-9 w-full items-center rounded-md border font-mono text-[13px] transition-colors sm:w-auto ${
				copied ? 'border-foreground' : 'border-border'
			}`}
		>
			<div className='flex h-full shrink-0 items-center gap-0.5 border-r border-border px-1'>
				{MANAGERS.map(name => (
					<button
						key={name}
						type='button'
						aria-pressed={manager === name}
						onClick={() => setManager(name)}
						className={`relative rounded-sm px-2 py-1 text-[11.5px] transition-colors duration-200 ${
							manager === name ? 'text-background' : 'text-muted-foreground hover:text-foreground'
						}`}
					>
						{/* One shared pill that slides between the tabs, rather than three
						    backgrounds fading in and out. Solid, so the active manager reads
						    from across the page instead of being a faint grey wash. */}
						{manager === name && (
							<motion.span
								layoutId='install-picker-active'
								className='absolute inset-0 rounded-sm bg-foreground'
								transition={{ type: 'spring', stiffness: 520, damping: 38 }}
							/>
						)}
						<span className='relative'>{name}</span>
					</button>
				))}
			</div>
			{/* The command is the copy button: a 13px icon is a poor target, and
			    clicking the thing you want is the obvious gesture. */}
			<button
				type='button'
				onClick={copy}
				aria-label={t('copy', { command })}
				className='group flex h-full min-w-0 flex-1 items-center gap-2.5 px-3 text-left sm:flex-none'
			>
				{/* Widest command reserves the width, so switching manager never
				    reflows the row the CTA sits in. Phones get a scroll instead. */}
				<span className='min-w-0 flex-1 overflow-x-auto whitespace-nowrap sm:w-[29ch] sm:flex-none'>
					<span className='mr-1.5 text-muted-foreground' aria-hidden>
						$
					</span>
					{/* key remounts the line on every switch, so the new command rolls in
					    character by character. Tighter stagger than the prices: 26
					    characters at the price cadence would take over a second. */}
					<code>
						<RollIn key={manager} text={command} stagger={0.012} />
					</code>
				</span>
				<span
					className={`relative size-3.5 shrink-0 transition-colors ${
						copied ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
					}`}
				>
					<motion.span
						key={copied ? 'copied' : 'idle'}
						className='absolute inset-0'
						initial={{ opacity: 0, scale: 0.5 }}
						animate={{ opacity: 1, scale: 1 }}
						transition={{ type: 'spring', stiffness: 700, damping: 26 }}
					>
						{copied ? <Check className='size-3.5' /> : <Copy className='size-3.5' />}
					</motion.span>
				</span>
			</button>
			<span aria-live='polite' className='sr-only'>
				{copied ? t('copied') : ''}
			</span>
		</div>
	)
}

/** The heading leads, the lead paragraph follows a beat later. */
function SectionHead({ title, lead }: { title: ReactNode; lead?: string }) {
	return (
		<Stagger className='mb-11 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between'>
			<motion.h2
				data-reveal
				variants={RISE_ITEM}
				className='text-4xl leading-[0.95] font-semibold tracking-[-0.04em] sm:text-5xl'
			>
				{title}
			</motion.h2>
			{lead && (
				<motion.p
					data-reveal
					variants={RISE_ITEM}
					className='max-w-[40ch] text-sm leading-relaxed text-muted-foreground'
				>
					{lead}
				</motion.p>
			)}
		</Stagger>
	)
}

/** Fills on the way in, from the left, once. The track carries the width so the
 *  bar animates on the compositor, and it is also what triggers: a bar scaled
 *  to zero has no area for the observer to see. */
function Meter({ percent, className }: { percent: number; className?: string }) {
	return (
		<motion.span
			data-reveal
			className={cn('block h-1 rounded-full bg-foreground/10', className)}
			initial='hidden'
			whileInView='visible'
			viewport={VIEWPORT}
		>
			<motion.span
				className='block h-full w-full origin-left rounded-full bg-foreground'
				variants={{
					hidden: { scaleX: 0 },
					visible: { scaleX: percent / 100, transition: { duration: 0.9, ease: EASE_OUT } },
				}}
			/>
		</motion.span>
	)
}

// ─── Dashboard mockup ────────────────────────────────────────────────────────
// A stripped copy of the real /dashboard: the status line, the headline strip
// of windows, the group table. Same numbers in the same places, none of the
// controls. Keep it in step with components/LiveDashboard.tsx — a shot that
// stops matching the product is worse than no shot.

function GroupDot({ color }: { color: string }) {
	return <span className='size-2 shrink-0 rounded-full' style={{ backgroundColor: color }} aria-hidden />
}

/** One window on one group: bar, budget percentage, tokens. */
function WindowCell({ percent, tokens }: { percent: number; tokens?: number }) {
	return (
		<div className='flex items-center gap-3 text-sm'>
			<Meter percent={percent} className='w-16 shrink-0' />
			<span className='tabular-nums'>
				~{percent}%
				{tokens !== undefined && <span className='text-muted-foreground'> · {millions(tokens)}</span>}
			</span>
		</div>
	)
}

/** One column of the headline strip: label, one big number, detail underneath. */
function StatCell({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
	return (
		<motion.div data-reveal variants={RISE_ITEM} className='flex flex-col gap-2 bg-background px-5 py-4'>
			<div className='text-[11px] text-muted-foreground'>{label}</div>
			<div className='text-2xl leading-none tabular-nums'>{value}</div>
			{children}
		</motion.div>
	)
}

/** The account's own utilization for one window, split across the groups
 *  underneath it — the whole product in one cell. */
function WindowStat({
	label,
	percent,
	resets,
	split,
}: {
	label: string
	percent: number
	resets: string
	split: 'session' | 'weekly'
}) {
	const t = useTranslations('landing.mockup')
	return (
		<StatCell label={label} value={`${percent}%`}>
			<Meter percent={percent} />
			<div className='text-[11px] text-muted-foreground'>{resets}</div>
			<div className='flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground'>
				{EXAMPLE_GROUPS.map(group => (
					<span key={group.name} className='flex min-w-0 items-center gap-1.5'>
						<GroupDot color={group.color} />
						<span className='truncate'>{t(`groupNames.${group.name}`)}</span>
						<span className='text-foreground tabular-nums'>{group[split]}%</span>
					</span>
				))}
			</div>
		</StatCell>
	)
}

function DashboardMockup() {
	const t = useTranslations('landing.mockup')
	return (
		<div className='overflow-hidden rounded-xl border border-border'>
			<div className='flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-5 py-3 text-xs text-muted-foreground'>
				<span className='size-1.5 rounded-full bg-emerald-500' aria-hidden />
				<span className='text-foreground'>{t('live')}</span>
				{t('status')}
				<span className='ml-auto'>{t('account')}</span>
			</div>

			{/* gap-px over bg-border is what draws the rules between the cells. */}
			<Stagger className='grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4'>
				<WindowStat
					label={t('session')}
					percent={account.session}
					resets={t('resetsSession')}
					split='session'
				/>
				<WindowStat label={t('weekly')} percent={account.weekly} resets={t('resetsWeekly')} split='weekly' />
				<StatCell label={t('devicesReporting')} value={String(account.devices)}>
					<div className='text-[11px] text-muted-foreground'>
						{t('acrossGroups', { count: EXAMPLE_GROUPS.length })}
					</div>
				</StatCell>
				<StatCell label={t('tokens')} value={millions(account.tokens)}>
					<div className='text-[11px] text-muted-foreground'>{t('billable')}</div>
				</StatCell>
			</Stagger>

			<div className='border-t border-border px-5 py-4'>
				<h3 className='text-[11px] font-medium tracking-wider text-muted-foreground uppercase'>
					{t('groups')}
				</h3>
				<div className='mt-3 hidden grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] gap-4 text-[11px] text-muted-foreground sm:grid'>
					<span>{t('group')}</span>
					<span>{t('sessionShort')}</span>
					<span>{t('weekly')}</span>
				</div>
				{/* Rows land one after another, the way the collector fills them. */}
				<Stagger className='mt-1'>
					{EXAMPLE_GROUPS.map(group => (
						<motion.div
							key={group.name}
							data-reveal
							variants={RISE_ITEM}
							className='grid gap-x-4 gap-y-2 border-t border-border py-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] sm:items-center'
						>
							<div className='flex min-w-0 items-center gap-2 text-sm'>
								<GroupDot color={group.color} />
								<span className='truncate'>{t(`groupNames.${group.name}`)}</span>
								<span className='shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground tabular-nums'>
									{t('devices', { count: group.devices })}
								</span>
							</div>
							<WindowCell percent={group.session} tokens={group.tokens} />
							<WindowCell percent={group.weekly} />
						</motion.div>
					))}
				</Stagger>
			</div>
		</div>
	)
}
