import type { ReactNode } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { motion, MotionConfig } from 'motion/react'
import { OrbitMark } from '@/components/orbit-mark'
import { ThemeToggle } from '@/components/theme-toggle'
import { buttonVariants } from '@/components/ui/button'
import { UsageFleetMark } from '@/components/usage-fleet-mark'
import { formatPlanPrice, FREE_DEVICES, PLANS, planPriceCents } from '@/lib/plans'
import type { PaidPlan, PlanPrices } from '@/lib/plans'
import { getSession } from '@/lib/session'
import { SITE_DESCRIPTION, SITE_NAME, siteUrl } from '@/lib/site'
import { planPrices } from '@/lib/stripe-prices'

// The marketing page stays public for everyone; a signed-in visitor just gets
// app links instead of sign-in links. Session lives in a cookie, so this has to
// be resolved on the server — as do the prices, which come from Stripe.
const landing = createServerFn().handler(async () => {
	const [session, prices] = await Promise.all([getSession(), planPrices()])
	return { signedIn: Boolean(session), prices }
})

const TITLE = `${SITE_NAME} — Claude Code usage across your whole fleet`

export const Route = createFileRoute('/')({
	loader: () => landing(),
	head: ({ loaderData }) => {
		const url = `${siteUrl()}/`
		// Offers need the Stripe prices, which only exist once the loader has run;
		// on a client-side navigation the page is already indexed, so skip them.
		const offered = loaderData ? [...pricingTiers(loaderData.prices), customTier(loaderData.prices)] : []
		return {
			meta: [
				{ title: TITLE },
				{ name: 'description', content: SITE_DESCRIPTION },
				{ property: 'og:title', content: TITLE },
				{ property: 'og:description', content: SITE_DESCRIPTION },
				{ property: 'og:url', content: url },
				{ name: 'twitter:title', content: TITLE },
				{ name: 'twitter:description', content: SITE_DESCRIPTION },
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
						description: SITE_DESCRIPTION,
						applicationCategory: 'DeveloperApplication',
						operatingSystem: 'macOS, Linux, Windows',
						// The same tiers the pricing section renders, so the two can't
						// disagree. Custom is quoted at its entry price, hence "from".
						offers: offered.map(tier => ({
							'@type': 'Offer',
							name: tier.plan,
							price: (tier.priceCents / 100).toFixed(2),
							priceCurrency: 'USD',
							description: `${tier.id === 'custom' ? 'from ' : ''}${tier.devices} device${
								tier.devices === 1 ? '' : 's'
							}`,
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
	{ name: 'Laptops', devices: 3, session: 62, weekly: 41, tokens: 4.2 },
	{ name: 'Work desktops', devices: 2, session: 23, weekly: 18, tokens: 1.6 },
	{ name: 'Home server', devices: 1, session: 9, weekly: 6, tokens: 0.5 },
]

const millions = (value: number) => `${value.toFixed(1)}M`

/** What the account number costs you when nothing splits it, against what the
 *  same number buys once it does. Numbered rather than bulleted: the pairs read
 *  across, problem to answer. */
const WITHOUT = [
	'You hit the 5 hour wall and cannot tell which machine got you there.',
	'The weekly limit lands mid sprint and nobody knows whose CI loop did it.',
	'Spreadsheets of token counts that never match what Anthropic actually meters.',
]

const WITH = [
	'Official utilization split by group, live in the window you are in.',
	'Every device grouped the way you work: laptops, CI runners, servers.',
	'A guard that stops a prompt before the wall instead of after it.',
]

/** Three commands, in the order you type them. `<token>` stays a placeholder:
 *  the real one is generated per device on the Devices page. */
const STEPS = [
	{
		n: '01',
		title: 'Install the collector',
		body: 'Zero runtime dependencies, Node 20 and up, the same command on every OS.',
		command: 'npm i -g @usagefleet/cli',
	},
	{
		n: '02',
		title: 'Pair the device',
		body: 'One token from the dashboard, shown once, stored as a hash on our side.',
		command: 'usagefleet login <token>',
	},
	{
		n: '03',
		title: 'Leave it alone',
		body: 'Autostarts with your session, tails the local logs, updates itself within six hours.',
		command: 'usagefleet status',
	},
]

const SPECS = [
	{
		key: 'source',
		title: 'Rate limit headers, not guesses',
		body: "The collector uses your existing local Claude login and reads unified 5 hour and 7 day utilization straight from Anthropic's response headers.",
	},
	{
		key: 'split',
		title: 'Groups get their real share',
		body: 'Claude Code logs are deduped by uuid and folded per request, so billable tokens decide how the official total divides between your machines.',
	},
	{
		key: 'setup',
		title: 'One command per machine',
		body: 'The collector installs on macOS, Linux and Windows, runs in the background and needs a token, nothing else.',
	},
	{
		key: 'privacy',
		title: 'Counters, not conversations',
		// Keep this in step with the collector payload (apps/cli/src/types.ts):
		// it also uploads cwd, git branch, hostname, model and session id.
		body: 'Prompts, responses and file contents never leave your machine. What does: token counts, model, session id, hostname, working directory and git branch.',
	},
]

/** The questions that decide whether someone installs it, answered in the same
 *  words the collector uses. Every one of these is a real invariant, not copy. */
const FAQ = [
	{
		q: 'Does this need an Anthropic API key?',
		a: 'No. The collector uses the Claude login already sitting on the machine, reads the local Claude Code logs and the rate limit headers that come back with them.',
	},
	{
		q: 'Can you see my prompts?',
		a: 'No. Prompts, responses and file contents never leave the machine. What is uploaded is counters plus context: token counts, model, session id, hostname, working directory and git branch.',
	},
	{
		q: 'Why do the group percentages add up past the account number?',
		a: 'Because a group is measured against its own slice of the account, not against the whole thing. Two groups, one using half of everything, means that group reads 100% of its budget while the account reads 50%.',
	},
	{
		q: 'What happens when I downgrade?',
		a: 'Devices over the new limit are parked, not deleted. Nothing is lost, and they report again with the same token as soon as they fit.',
	},
	{
		q: 'Does the guard block my work if you go down?',
		a: 'Never. Offline, timed out, junk response or a server too old to answer all exit clean. Only an explicit refusal stops a prompt.',
	},
]

/** The published package: same command on every OS, and npm does the fetching,
 *  the integrity check and the upgrades. */
const INSTALL_COMMAND = 'npm i -g @usagefleet/cli'

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
	perk: string
	highlight: boolean
}

function pricingTiers(prices: PlanPrices): Tier[] {
	return [
		{
			id: null,
			plan: 'Free',
			note: 'start here',
			price: '$0',
			period: null,
			priceCents: 0,
			devices: FREE_DEVICES,
			perk: '5h and weekly windows',
			highlight: false,
		},
		{
			id: 'solo',
			plan: PLANS.solo.label,
			note: 'most people',
			price: formatPlanPrice(prices.solo),
			period: '/ mo',
			priceCents: prices.solo,
			devices: PLANS.solo.devices,
			perk: 'Everything in Free',
			highlight: true,
		},
		{
			id: 'fleet',
			plan: PLANS.fleet.label,
			note: 'teams, CI, servers',
			price: formatPlanPrice(prices.fleet),
			period: '/ mo',
			priceCents: prices.fleet,
			devices: PLANS.fleet.devices,
			perk: 'Everything in Solo',
			highlight: false,
		},
	]
}

/** Priced per device rather than by tier, so it sits below the grid instead of
 *  inside it: `devices` and `price` here are the floor, not the whole offer. */
function customTier(prices: PlanPrices): Tier {
	return {
		id: 'custom',
		plan: PLANS.custom.label,
		note: 'bigger fleets',
		price: formatPlanPrice(prices.custom),
		period: '/ device / mo',
		priceCents: planPriceCents('custom', PLANS.custom.minDevices, prices),
		devices: PLANS.custom.minDevices,
		perk: 'Everything in Fleet',
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

function Landing() {
	const { signedIn, prices } = Route.useLoaderData()
	const tiers = pricingTiers(prices)
	const custom = customTier(prices)
	const appHref = signedIn ? '/dashboard' : '/login'
	const appLabel = signedIn ? 'Open dashboard' : 'Get started'

	return (
		// reducedMotion='user' is the whole accessibility story for this page:
		// motion drops the transforms and keeps the fades when the OS asks it to.
		<MotionConfig reducedMotion='user'>
			{/* Every reveal starts at opacity 0, which without scripting would be a
			    blank page rather than a subtle one. */}
			<noscript>
				<style>{'[data-reveal]{opacity:1!important;transform:none!important}'}</style>
			</noscript>

			<div className='flex-1 bg-background text-foreground'>
				<div className='mx-auto w-full max-w-5xl px-6'>
					<header className='flex h-14 items-center justify-between border-b border-border'>
						<span className='flex items-center gap-2 font-semibold tracking-tight'>
							<UsageFleetMark className='size-5' />
							UsageFleet
						</span>
						<nav className='hidden gap-7 text-sm text-muted-foreground sm:flex'>
							<a href='#how' className='transition-colors hover:text-foreground'>
								How it works
							</a>
							<a href='#pricing' className='transition-colors hover:text-foreground'>
								Pricing
							</a>
							<a href='#faq' className='transition-colors hover:text-foreground'>
								FAQ
							</a>
						</nav>
						<Link to={appHref} className={buttonVariants()}>
							{signedIn ? 'Dashboard' : 'Sign in'}
						</Link>
					</header>

					<section className='grid items-center gap-11 pt-16 lg:grid-cols-[1.12fr_0.88fr] lg:gap-12'>
						<Reveal>
							<p className='font-mono text-[11px] tracking-[0.12em] text-muted-foreground/70 uppercase'>
								Claude Code usage, per machine
							</p>
							<h1 className='mt-5 text-[clamp(2.4rem,6.4vw,4.25rem)] leading-[0.98] font-semibold tracking-[-0.045em]'>
								One subscription,
								<br />
								<span className='text-muted-foreground'>many machines.</span>
							</h1>
							<p className='mt-6 max-w-[52ch] leading-relaxed text-muted-foreground'>
								UsageFleet reads Anthropic&apos;s own 5 hour and weekly utilization straight from the
								response headers, then splits it across the device groups you define. No estimates, no
								scraping, no prompts leaving your machine.
							</p>
							<div className='mt-7 flex flex-wrap items-center gap-3'>
								<Link to={appHref} className={buttonVariants({ size: 'lg' })}>
									{appLabel}
								</Link>
								<code className='flex h-9 items-center gap-2.5 rounded-md border border-border px-3.5 font-mono text-[13px] text-muted-foreground'>
									<span className='text-muted-foreground/70'>$</span>
									<span className='text-foreground'>{INSTALL_COMMAND}</span>
								</code>
							</div>
							<ul className='mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11.5px] text-muted-foreground/70'>
								{['macOS, Linux, Windows', 'Setup under a minute', 'Counters, never prompts'].map(
									item => (
										<li
											key={item}
											className='flex items-center gap-2 before:size-[3px] before:rounded-full before:bg-current'
										>
											{item}
										</li>
									),
								)}
							</ul>
						</Reveal>
						<Reveal delay={0.08}>
							<OrbitMark className='mx-auto max-w-[420px]' />
						</Reveal>
					</section>

					<Reveal className='mt-14'>
						<div className='overflow-hidden rounded-xl border border-border'>
							<div className='flex flex-wrap gap-x-4 gap-y-1.5 border-b border-border px-4 py-2.5 font-mono text-xs text-muted-foreground/70'>
								<span className='text-foreground'>example account</span>
								<span>5h window resets in 02:14</span>
								<span>weekly resets Mon 09:00</span>
							</div>
							{/* The five columns do not fit a phone; scroll them instead of shrinking. */}
							<div className='overflow-x-auto'>
								<table className='w-full min-w-[560px] font-mono text-[13px]'>
									<thead className='text-muted-foreground/70'>
										<tr className='[&>th]:border-b [&>th]:border-border [&>th]:px-4 [&>th]:py-2.5 [&>th]:text-right [&>th]:font-normal'>
											<th className='w-2/5 !text-left'>group</th>
											<th>devices</th>
											<th>5h</th>
											<th>weekly</th>
											<th>tokens 5h</th>
										</tr>
									</thead>
									<tbody className='[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-border [&>tr>td]:px-4 [&>tr>td]:py-2.5 [&>tr>td]:text-right [&>tr>td:first-child]:text-left'>
										{EXAMPLE_GROUPS.map(group => (
											<tr key={group.name}>
												<td>
													{group.name}
													<Meter percent={group.session} />
												</td>
												<td className='text-muted-foreground/70'>{group.devices}</td>
												<td>{group.session}%</td>
												<td>{group.weekly}%</td>
												<td>{millions(group.tokens)}</td>
											</tr>
										))}
										<tr className='bg-muted/40'>
											<td>
												Account
												<Meter percent={account.session} />
											</td>
											<td className='text-muted-foreground/70'>{account.devices}</td>
											<td>{account.session}%</td>
											<td>{account.weekly}%</td>
											<td>{millions(account.tokens)}</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</Reveal>

					<section className='border-t border-border py-20'>
						<SectionHead
							title={
								<>
									The account says {account.session}%.
									<br />
									<span className='text-muted-foreground'>One group spent most of it.</span>
								</>
							}
							lead='Anthropic meters the subscription, not the machine. That single number is the only thing you get, and it hides everything you would act on.'
						/>
						{/* bg-border showing through the gap is what draws the hairline. */}
						<Reveal className='overflow-hidden rounded-xl border border-border bg-border'>
							<div className='grid gap-px sm:grid-cols-2'>
								<Column tag='without' title='A number with no owner' items={WITHOUT} />
								<Column tag='with UsageFleet' title='The same number, attributed' items={WITH} bright />
							</div>
						</Reveal>
					</section>

					<section id='how' className='scroll-mt-8 border-t border-border py-20'>
						<SectionHead
							title={
								<>
									Three commands.
									<br />
									<span className='text-muted-foreground'>Then it is just running.</span>
								</>
							}
							lead='The collector uses the Claude login already on the machine. Nothing to configure, nothing to keep open.'
						/>
						<Reveal className='border-y border-border bg-border'>
							<div className='grid gap-px sm:grid-cols-3'>
								{STEPS.map(step => (
									<div key={step.n} className='bg-background px-5 py-6'>
										<span className='font-mono text-[11px] text-muted-foreground/70'>{step.n}</span>
										<h3 className='mt-3.5 text-lg font-medium tracking-tight'>{step.title}</h3>
										<p className='mt-2.5 text-sm leading-relaxed text-muted-foreground'>
											{step.body}
										</p>
										<code className='mt-3.5 block overflow-x-auto font-mono text-xs whitespace-nowrap text-muted-foreground/70'>
											{step.command}
										</code>
									</div>
								))}
							</div>
						</Reveal>
					</section>

					<section className='border-t border-border py-20'>
						<SectionHead
							title={
								<>
									Small collector.
									<br />
									<span className='text-muted-foreground'>Honest output.</span>
								</>
							}
							lead='Everything it does is boring on purpose.'
						/>
						<div className='w-full lg:w-3/4'>
							{SPECS.map(spec => (
								<Reveal
									key={spec.key}
									className='grid gap-2 border-t border-border py-6 last:border-b sm:grid-cols-[90px_1fr] sm:gap-7'
								>
									<span className='pt-1 font-mono text-xs text-muted-foreground/70'>{spec.key}</span>
									<div>
										<h3 className='text-lg font-medium tracking-tight'>{spec.title}</h3>
										<p className='mt-1.5 max-w-[62ch] text-muted-foreground'>{spec.body}</p>
									</div>
								</Reveal>
							))}
						</div>
						<Reveal>
							<p className='mt-16 max-w-[28ch] text-2xl leading-tight tracking-tight'>
								Anthropic tells you one number.{' '}
								<span className='text-muted-foreground'>UsageFleet tells you whose it was.</span>
							</p>
						</Reveal>
					</section>

					<section id='pricing' className='scroll-mt-8 border-t border-border py-20'>
						<SectionHead
							title={
								<>
									Simple plans.
									<br />
									<span className='text-muted-foreground'>Exact limits.</span>
								</>
							}
							lead='Max groups matches your device count. Cancel any time, the free plan keeps working.'
						/>
						<Reveal className='overflow-hidden rounded-xl border border-border bg-border'>
							<div className='grid gap-px sm:grid-cols-3'>
								{tiers.map(tier => (
									<div
										key={tier.plan}
										className={`flex flex-col gap-4 px-5 py-6 ${
											tier.highlight
												? 'bg-muted/40 shadow-[inset_0_2px_0_var(--foreground)]'
												: 'bg-background'
										}`}
									>
										<div className='flex items-baseline justify-between'>
											<span className='font-medium tracking-tight'>{tier.plan}</span>
											<span className='font-mono text-[11px] text-muted-foreground/70'>
												{tier.note}
											</span>
										</div>
										<div className='font-mono text-4xl tracking-[-0.045em]'>
											{tier.price}
											{tier.period && (
												<span className='ml-1.5 text-xs tracking-normal text-muted-foreground/70'>
													{tier.period}
												</span>
											)}
										</div>
										<ul className='flex flex-col gap-2 text-sm text-muted-foreground'>
											<li>
												<b className='font-mono font-medium text-foreground'>{tier.devices}</b>{' '}
												{tier.devices === 1 ? 'device' : 'devices'}
											</li>
											<li>
												<b className='font-mono font-medium text-foreground'>{tier.devices}</b>{' '}
												{tier.devices === 1 ? 'group' : 'groups'}
											</li>
											<li>{tier.perk}</li>
										</ul>
										<div className='mt-auto pt-2'>
											{/* /login drops ?plan= for anyone already signed in, so send
                        them straight to the page that acts on it. */}
											<Link
												to={signedIn ? '/billing' : '/login'}
												search={tier.id ? { plan: tier.id } : {}}
												className={buttonVariants({
													variant: tier.highlight ? 'default' : 'outline',
													className: 'w-full justify-center',
												})}
											>
												{tier.highlight ? `Choose ${tier.plan}` : `Start ${tier.plan}`}
											</Link>
										</div>
									</div>
								))}
							</div>

							{/* Priced per device, so it is one line of prose rather than a
                  fourth column with a number that would be wrong for everyone. */}
							<div className='mt-px flex flex-wrap items-center justify-between gap-x-8 gap-y-5 bg-background px-5 py-6'>
								<div>
									<div className='flex items-baseline gap-3'>
										<span className='font-medium tracking-tight'>{custom.plan}</span>
										<span className='font-mono text-[11px] text-muted-foreground/70'>
											{custom.note}
										</span>
									</div>
									<p className='mt-2 max-w-[46ch] text-sm leading-relaxed text-muted-foreground'>
										Any number of devices from{' '}
										<b className='font-mono font-medium text-foreground'>{custom.devices}</b> to{' '}
										<b className='font-mono font-medium text-foreground'>
											{PLANS.custom.maxDevices}
										</b>
										, as many groups, and everything in {PLANS.fleet.label}.
									</p>
								</div>
								<div className='flex flex-wrap items-center gap-x-7 gap-y-4'>
									<div className='font-mono text-4xl tracking-[-0.045em]'>
										{custom.price}
										<span className='ml-1.5 text-xs tracking-normal text-muted-foreground/70'>
											{custom.period}
										</span>
									</div>
									<Link
										to={signedIn ? '/billing' : '/login'}
										search={{ plan: 'custom' }}
										className={buttonVariants({ variant: 'outline' })}
									>
										Start {custom.plan}
									</Link>
								</div>
							</div>
						</Reveal>
					</section>

					<section id='faq' className='scroll-mt-8 border-t border-border py-20'>
						<SectionHead title='Questions people actually ask.' />
						<Reveal>
							{FAQ.map(item => (
								// <details> rather than an accordion component: it opens without
								// scripting and needs no state.
								<details key={item.q} className='group border-t border-border last:border-b'>
									<summary className='flex cursor-pointer list-none items-center justify-between gap-5 py-4.5 transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden'>
										{item.q}
										<span className='font-mono text-lg text-muted-foreground/70 group-open:hidden'>
											+
										</span>
										<span className='hidden font-mono text-lg text-muted-foreground/70 group-open:inline'>
											−
										</span>
									</summary>
									<p className='max-w-[68ch] pb-5 text-sm leading-relaxed text-muted-foreground'>
										{item.a}
									</p>
								</details>
							))}
						</Reveal>
					</section>

					<section className='border-t border-border py-20'>
						<Reveal className='flex flex-wrap items-center justify-between gap-5'>
							{/* min-w-0: without it the nowrap command line stretches the flex row. */}
							<div className='min-w-0'>
								<h2 className='text-3xl font-semibold tracking-[-0.03em]'>
									Stop guessing which machine ate the window.
								</h2>
								<code className='mt-3 block overflow-x-auto font-mono text-xs whitespace-nowrap text-muted-foreground/70'>
									{INSTALL_COMMAND}
								</code>
							</div>
							<Link to={appHref} className={buttonVariants({ size: 'lg' })}>
								{appLabel}
							</Link>
						</Reveal>
					</section>

					<footer className='flex flex-wrap items-center justify-between gap-4 border-t border-border py-5 pb-10 font-mono text-xs text-muted-foreground/70'>
						<span className='flex items-center gap-2'>
							<UsageFleetMark className='size-3.5' />
							USAGEFLEET
						</span>
						<ThemeToggle />
						<span>MACOS / LINUX / WINDOWS</span>
					</footer>
				</div>
			</div>
		</MotionConfig>
	)
}

/** Curve for every reveal on the page: fast out of the gate, long tail. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const

/** Scroll-in for one block. `once` so nothing re-animates on the way back up,
 *  and the travel is small — this is punctuation, not choreography. */
function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
	return (
		<motion.div
			data-reveal
			className={className}
			initial={{ opacity: 0, y: 10 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, margin: '0px 0px -8% 0px' }}
			transition={{ duration: 0.55, ease: EASE_OUT, delay }}
		>
			{children}
		</motion.div>
	)
}

function SectionHead({ title, lead }: { title: ReactNode; lead?: string }) {
	return (
		<Reveal className='mb-11 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between'>
			<h2 className='text-4xl leading-[0.95] font-semibold tracking-[-0.04em] sm:text-5xl'>{title}</h2>
			{lead && <p className='max-w-[40ch] text-sm leading-relaxed text-muted-foreground'>{lead}</p>}
		</Reveal>
	)
}

function Column({ tag, title, items, bright }: { tag: string; title: string; items: string[]; bright?: boolean }) {
	return (
		<div className='bg-background px-6 py-7'>
			<span className='font-mono text-[11px] tracking-[0.1em] text-muted-foreground/70 uppercase'>{tag}</span>
			<h3 className='mt-3.5 font-medium tracking-tight'>{title}</h3>
			<ul className='mt-4 flex flex-col gap-3 text-sm text-muted-foreground'>
				{items.map((item, i) => (
					<li key={item} className='grid grid-cols-[18px_1fr] gap-2.5'>
						<span className={`font-mono ${bright ? 'text-foreground' : 'text-muted-foreground/70'}`}>
							{String(i + 1).padStart(2, '0')}
						</span>
						<span>{item}</span>
					</li>
				))}
			</ul>
		</div>
	)
}

/** Fills on the way in, from the left, once. The track carries the width so the
 *  bar can animate on the compositor. */
function Meter({ percent }: { percent: number }) {
	return (
		<span className='mt-1.5 block h-1 rounded-full bg-foreground/10'>
			<motion.span
				data-reveal
				className='block h-full w-full origin-left rounded-full bg-foreground'
				initial={{ scaleX: 0 }}
				whileInView={{ scaleX: percent / 100 }}
				viewport={{ once: true }}
				transition={{ duration: 0.9, ease: EASE_OUT }}
			/>
		</span>
	)
}
