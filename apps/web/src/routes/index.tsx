import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { ArrowRight } from 'lucide-react'
import type { Variants } from 'motion/react'
import { motion, MotionConfig, useScroll, useTransform } from 'motion/react'
import { createTranslator, useLocale, useTranslations } from 'use-intl'
import { Accordion } from '@/components/arc/accordion/accordion'
import { AnimatedCounter } from '@/components/arc/animated-counter/animated-counter'
import { Badge } from '@/components/arc/badge/badge'
import { buttonClassName } from '@/components/arc/button/button'
import { CopyButton } from '@/components/arc/copy-button/copy-button'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import { GroupDot, Meter, SliceBar } from '@/components/LiveDashboard'
import { SiteFooter } from '@/components/site-footer'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { formatTokens, formatUsd } from '@/lib/format'
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

/** Sample account mid window. `session` and `weekly` are each group's use of
 *  its own slice, as the dashboard reports them; `costUsd` is this week's spend. */
const EXAMPLE_GROUPS = [
	// Hexes are straight out of lib/group-colors, so the mockup can only show a
	// dot a real group could actually be wearing.
	{ name: 'laptops', color: '#6366f1', devices: 3, session: 62, weekly: 41, tokens: 4_200_000, costUsd: 21.4 },
	{ name: 'workDesktops', color: '#10b981', devices: 2, session: 23, weekly: 18, tokens: 1_600_000, costUsd: 8.1 },
	{ name: 'homeServer', color: '#06b6d4', devices: 1, session: 9, weekly: 6, tokens: 500_000, costUsd: 2.12 },
] as const

const EXAMPLE_MONTH_USD = 128.35

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
	{ n: 1, key: 'install', command: INSTALL_COMMANDS.npm },
	{ n: 2, key: 'pair', command: 'usagefleet login <token>' },
	{ n: 3, key: 'leave', command: 'usagefleet status' },
] as const

// Keep `privacy` in step with the collector payload (apps/cli/src/types.ts):
// it also uploads cwd, git branch, hostname, model and session id.
const SPECS = ['source', 'split', 'privacy'] as const

/** Max groups always equals the plan's device cap, so one number drives both
 *  rows. `highlight` marks the tier the columns lean on. */
// Device count is the only thing a subscription actually gates (see plans.ts),
// so every perk line below has to be something all tiers really get. `id` is
// what the CTA carries through sign-in so /account can preselect the plan.
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
						<Link to={appHref} className={buttonClassName()}>
							{signedIn ? t('nav.app') : t('nav.signIn')}
						</Link>
					</div>
				</header>

				<div className='mx-auto w-full max-w-7xl px-6'>
					<section id='top' ref={heroRef} className='pt-20 sm:pt-28'>
						{/* The copy drifts up and dims as the page scrolls past it, so the
						    dashboard below arrives into a settled frame. */}
						<motion.div
							style={{ y: heroY, opacity: heroOpacity }}
							className='flex flex-col items-center text-center'
						>
							<h1 className='text-[clamp(2.1rem,7vw,4.75rem)] leading-[1.02] font-semibold tracking-[-0.045em]'>
								{/* Word by word out of a blur: the one piece of choreography on
								    the page, and it only plays once, on load. */}
								<Word delay={0.06}>{t('hero.headline.one')}</Word>{' '}
								<Word delay={0.16}>{t('hero.headline.subscription')}</Word>
								<br />
								<Word delay={0.26} className='text-muted-foreground'>
									{t('hero.headline.many')}
								</Word>{' '}
								<Word delay={0.34} className='text-muted-foreground'>
									{t('hero.headline.machines')}
								</Word>
							</h1>
							<motion.p
								className='mt-6 max-w-[52ch] text-lg text-muted-foreground'
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.44, duration: 0.45, ease: EASE_OUT }}
							>
								{t('hero.lead')}
							</motion.p>
							<motion.div
								className='mt-8 flex w-full flex-wrap items-center justify-center gap-3'
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.56, duration: 0.45, ease: EASE_OUT }}
							>
								<PrimaryCta to={appHref} label={appLabel} />
								<InstallPicker />
							</motion.div>
							<motion.ul
								className='mt-5 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground'
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								transition={{ delay: 0.72, duration: 0.5, ease: EASE_OUT }}
							>
								{(['setup', 'prompts'] as const).map(badge => (
									<li
										key={badge}
										className='flex items-center gap-2 before:size-1 before:rounded-full before:bg-current'
									>
										{t(`hero.badges.${badge}`)}
									</li>
								))}
							</motion.ul>
						</motion.div>
					</section>

					<Reveal className='relative mt-16 sm:mt-20'>
						<DashboardMockup />
						{/* The app rises out of the page instead of ending on a hard edge. */}
						<div
							className='pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-linear-to-b from-transparent to-background'
							aria-hidden
						/>
					</Reveal>

					<section id='how' className='scroll-mt-20 pt-28 sm:pt-36'>
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
						<Stagger className='grid gap-4 sm:grid-cols-3'>
							{STEPS.map(step => (
								<motion.div
									key={step.n}
									data-reveal
									variants={RISE_ITEM}
									className='flex flex-col gap-3 rounded-(--radius-surface) border bg-surface p-6'
								>
									<span className='grid size-8 place-items-center rounded-full bg-muted text-sm text-muted-foreground tabular-nums'>
										{step.n}
									</span>
									<h3 className='mt-1 text-lg font-medium tracking-tight'>
										{t(`how.steps.${step.key}.title`)}
									</h3>
									<p className='text-sm leading-relaxed text-muted-foreground'>
										{t(`how.steps.${step.key}.body`)}
									</p>
									<code className='mt-auto block overflow-x-auto pt-1 font-mono text-xs whitespace-nowrap text-muted-foreground'>
										{step.command}
									</code>
								</motion.div>
							))}
						</Stagger>
						{/* What the collector actually does: the same story as the steps, so
						    it follows them without a heading of its own. */}
						<Stagger className='mt-12 grid gap-8 sm:grid-cols-3'>
							{SPECS.map(spec => (
								<motion.div
									key={spec}
									data-reveal
									variants={RISE_ITEM}
									className='flex flex-col gap-1.5'
								>
									<h3 className='font-medium'>{t(`how.specs.${spec}.title`)}</h3>
									<p className='text-sm leading-relaxed text-muted-foreground'>
										{t(`how.specs.${spec}.body`)}
									</p>
								</motion.div>
							))}
						</Stagger>
					</section>

					<section id='pricing' className='scroll-mt-20 pt-28 sm:pt-36'>
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
						{/* Custom rides in the grid as a fourth column instead of a stranded
						    row below it: same lines as the rest, its price is just per device. */}
						<Stagger className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
							{tiers.map(tier => (
								<motion.div
									key={tier.plan}
									data-reveal
									variants={RISE_ITEM}
									className={cn(
										'flex flex-col gap-4 rounded-(--radius-surface) border bg-surface p-6',
										tier.highlight && 'border-(--border-strong) bg-muted',
									)}
								>
									<div className='flex items-center justify-between gap-2'>
										<span className='text-lg font-medium tracking-tight'>{tier.plan}</span>
										{tier.highlight ? (
											<Badge size='sm'>{tier.note}</Badge>
										) : (
											<span className='truncate text-xs text-muted-foreground'>{tier.note}</span>
										)}
									</div>
									<div className='flex items-baseline text-4xl leading-none font-semibold tracking-[-0.03em] tabular-nums'>
										<RollIn text={tier.price} />
										{tier.period && (
											<span className='ml-1.5 text-sm font-normal tracking-normal text-muted-foreground'>
												{tier.period}
											</span>
										)}
									</div>
									<ul className='flex flex-col gap-1.5 text-sm text-muted-foreground'>
										<li>
											<b className='font-medium text-foreground tabular-nums'>{tier.devices}</b>
											{tier.id === 'custom' ? (
												<>
													{t('pricing.rangeTo')}
													<b className='font-medium text-foreground tabular-nums'>
														{PLANS.custom.maxDevices}
													</b>
												</>
											) : null}{' '}
											{/* Custom shows a range, so the noun has to agree with the
											    number the reader ends on, not with the floor. */}
											{t('pricing.devices', {
												count: tier.id === 'custom' ? PLANS.custom.maxDevices : tier.devices,
											})}
										</li>
										<li>
											{tier.id === 'custom' ? (
												t('pricing.asManyGroups')
											) : (
												<>
													<b className='font-medium text-foreground tabular-nums'>
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
										to={signedIn ? '/account' : '/login'}
										search={tier.id ? { plan: tier.id } : {}}
										className={buttonClassName({
											variant: tier.highlight ? 'primary' : 'secondary',
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
						    the shared half is stated once under all of them. */}
						<Reveal className='mt-6 text-center text-sm text-muted-foreground'>
							<span className='font-medium text-foreground'>{t('pricing.everyPlan')}:</span>{' '}
							{t('pricing.everyPlanBody')}
						</Reveal>
					</section>

					<section id='faq' className='scroll-mt-20 pt-28 sm:pt-36'>
						<SectionHead title={t('faq.title')} />
						<Reveal className='mx-auto max-w-3xl'>
							<Accordion
								size='lg'
								items={FAQ.map(key => ({
									value: key,
									title: t(`faq.${key}Q`),
									content: t(`faq.${key}A`),
								}))}
							/>
						</Reveal>
					</section>

					<section className='py-28 sm:py-36'>
						<Reveal className='flex flex-col items-center gap-6 rounded-(--radius-panel) border bg-surface px-6 py-16 text-center sm:py-20'>
							<h2 className='max-w-[22ch] text-3xl leading-[1.05] font-semibold tracking-[-0.03em] sm:text-4xl'>
								{t('cta.title')}
							</h2>
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
			className={buttonClassName({ size: 'lg', className: 'relative overflow-hidden px-6' })}
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
	const tCommon = useTranslations('common')
	const [manager, setManager] = useState<PackageManager>('npm')
	const command = INSTALL_COMMANDS[manager]

	return (
		<div className='flex w-full flex-col items-center gap-2 sm:w-auto sm:flex-row'>
			<SegmentedControl
				label={t('manager')}
				options={MANAGERS.map(name => ({ value: name, label: name }))}
				value={manager}
				onValueChange={setManager}
			/>
			<div className='flex h-11 min-w-0 items-center gap-2 self-stretch rounded-(--radius-control) border bg-surface pr-1.5 pl-4 font-mono text-[13px] sm:self-auto'>
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
				<CopyButton
					variant='plain'
					value={command}
					label={t('copy', { command })}
					messages={{ copied: tCommon('copied'), failed: tCommon('copyFailed') }}
				/>
			</div>
		</div>
	)
}

/** Centered: the heading leads, the lead paragraph follows a beat later. */
function SectionHead({ title, lead }: { title: ReactNode; lead?: string }) {
	return (
		<Stagger className='mb-12 flex flex-col items-center gap-5 text-center'>
			<motion.h2
				data-reveal
				variants={RISE_ITEM}
				className='text-4xl leading-[1.02] font-semibold tracking-[-0.04em] sm:text-5xl'
			>
				{title}
			</motion.h2>
			{lead && (
				<motion.p
					data-reveal
					variants={RISE_ITEM}
					className='max-w-[52ch] text-base leading-relaxed text-muted-foreground'
				>
					{lead}
				</motion.p>
			)}
		</Stagger>
	)
}

// ─── Dashboard preview ───────────────────────────────────────────────────────
// The "Current usage" section of /dashboard over sample data, drawn with the
// dashboard's own Meter and SliceBar so the shot cannot drift from the product.

function DashboardMockup() {
	const t = useTranslations('landing.mockup')
	const tDash = useTranslations('dash.overview')
	const tUsage = useTranslations('dash.usage')
	// A group's percentage is of its 1/N slice, so it adds 1/N of that to the account.
	const split = (window: 'session' | 'weekly') =>
		EXAMPLE_GROUPS.map(g => ({
			color: g.color,
			id: g.name,
			label: t(`groupNames.${g.name}`),
			value: g[window] / EXAMPLE_GROUPS.length,
		}))
	const session = split('session')
	const weekly = split('weekly')
	const total = (values: readonly number[]) => values.reduce((sum, v) => sum + v, 0)

	return (
		<div className='overflow-hidden rounded-(--radius-panel) border bg-surface'>
			<div className='flex items-center gap-3 border-b px-5 py-3 text-xs text-muted-foreground'>
				<span className='flex gap-1.5' aria-hidden>
					<span className='size-2.5 rounded-full bg-muted' />
					<span className='size-2.5 rounded-full bg-muted' />
					<span className='size-2.5 rounded-full bg-muted' />
				</span>
				<span className='ml-auto'>{t('account')}</span>
			</div>
			<div className='flex flex-col gap-8 p-5 sm:p-6'>
				<div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
					<h3 className='text-base font-medium'>{tDash('currentUsage')}</h3>
					<p className='flex flex-wrap items-center gap-2 text-xs text-muted-foreground'>
						<Badge tone='success' size='sm'>
							{t('live')}
						</Badge>
						{t('status')}
					</p>
				</div>
				<div className='grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-x-8 gap-y-6'>
					<Meter
						label={tDash('fiveHourSession')}
						pct={total(session.map(s => s.value))}
						resets={t('resetsSession')}
						segments={session}
					/>
					<Meter
						label={tUsage('weekly')}
						pct={total(weekly.map(s => s.value))}
						resets={t('resetsWeekly')}
						segments={weekly}
					/>
					<div className='flex min-w-0 flex-col gap-4'>
						<p className='flex min-h-7 items-center text-base font-medium'>{tDash('spendWeek')}</p>
						<AnimatedCounter
							value={total(EXAMPLE_GROUPS.map(g => g.costUsd))}
							prefix='$'
							decimals={2}
							animateOnView
						/>
						<p className='text-xs text-muted-foreground'>
							{formatTokens(total(EXAMPLE_GROUPS.map(g => g.tokens)))} · {formatUsd(EXAMPLE_MONTH_USD)}{' '}
							{tDash('month')}
						</p>
					</div>
				</div>
				<ul className='grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3'>
					{EXAMPLE_GROUPS.map(g => (
						<li key={g.name} className='flex min-w-0 flex-col gap-3 rounded-(--radius-panel) border p-4'>
							<div className='flex min-w-0 items-center gap-2 text-sm'>
								<GroupDot color={g.color} />
								<span className='truncate font-medium'>{t(`groupNames.${g.name}`)}</span>
								<span className='ml-auto shrink-0 text-xs text-muted-foreground'>
									{t('devices', { count: g.devices })}
								</span>
							</div>
							<SliceBar label='5h' pct={g.session} color={g.color} />
							<SliceBar label={tDash('week')} pct={g.weekly} color={g.color} />
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}
