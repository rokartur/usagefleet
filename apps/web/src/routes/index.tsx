import { createFileRoute, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
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
	return (
		<div className='flex-1 bg-black text-white'>
			<div className='mx-auto w-full max-w-5xl px-6'>
				<header className='flex h-14 items-center justify-between border-b border-white/10'>
					<span className='flex items-center gap-2 font-semibold tracking-tight'>
						<UsageFleetMark className='size-5' />
						UsageFleet
					</span>
					<Link to={signedIn ? '/dashboard' : '/login'} className={buttonVariants()}>
						{signedIn ? 'Dashboard' : 'Sign in'}
					</Link>
				</header>

				<section className='relative min-h-[440px] overflow-hidden pt-[78px]'>
					<UsageFleetMark className='pointer-events-none absolute top-4 -right-[13.125rem] size-[530px] text-[#111] sm:-right-[105px]' />
					<h1 className='relative z-10 max-w-[760px] text-5xl leading-[0.98] font-semibold tracking-[-0.04em] sm:text-7xl lg:text-[78px]'>
						Six machines.
						<br />
						One subscription.
						<br />
						<span className='text-neutral-500'>One honest number.</span>
					</h1>

					<div className='relative z-10 mt-[25px] flex flex-wrap items-center gap-x-8 gap-y-5'>
						<p className='max-w-[48ch] text-sm leading-relaxed text-neutral-400'>
							UsageFleet reports Anthropic&apos;s own 5 hour and weekly utilization, then splits it across
							the device groups you define. Sign in with GitHub or Google, add a machine, done.
						</p>
						<Link to={signedIn ? '/dashboard' : '/login'} className={buttonVariants({ size: 'lg' })}>
							{signedIn ? 'Open dashboard' : 'Get started'}
						</Link>
					</div>
				</section>

				<section className='relative isolate overflow-hidden border-t border-white/10 py-20'>
					<UsageFleetMark className='pointer-events-none absolute -top-16 -left-48 size-[390px] text-[#111] sm:-left-36' />
					<div className='relative z-10 mb-12 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between'>
						<h2 className='text-4xl leading-[0.95] font-semibold tracking-[-0.04em] sm:text-5xl'>
							Simple plans.
							<br />
							<span className='text-neutral-600'>Exact limits.</span>
						</h2>
						<p className='max-w-[40ch] text-sm leading-relaxed text-neutral-400'>
							Max groups matches your device count. Cancel any time, the free plan keeps working.
						</p>
					</div>
					{/* bg-white/10 showing through the gaps is what draws the hairlines. */}
					<div className='relative z-10 overflow-hidden border border-white/10 bg-white/10'>
						<div className='grid gap-px sm:grid-cols-3'>
							{tiers.map(tier => (
								<div
									key={tier.plan}
									className={`flex flex-col gap-4 px-5 py-6 ${
										tier.highlight ? 'bg-neutral-950 shadow-[inset_0_2px_0_#fff]' : 'bg-black'
									}`}
								>
									<div className='flex items-baseline justify-between'>
										<span className='font-medium tracking-tight'>{tier.plan}</span>
										<span className='font-mono text-[11px] text-neutral-500'>{tier.note}</span>
									</div>
									<div className='font-mono text-4xl tracking-[-0.045em]'>
										{tier.price}
										{tier.period && (
											<span className='ml-1.5 text-xs tracking-normal text-neutral-500'>
												{tier.period}
											</span>
										)}
									</div>
									<ul className='flex flex-col gap-2 text-sm text-neutral-400'>
										<li>
											<b className='font-mono font-medium text-white'>{tier.devices}</b>{' '}
											{tier.devices === 1 ? 'device' : 'devices'}
										</li>
										<li>
											<b className='font-mono font-medium text-white'>{tier.devices}</b>{' '}
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
						<div className='mt-px flex flex-wrap items-center justify-between gap-x-8 gap-y-5 bg-black px-5 py-6'>
							<div>
								<div className='flex items-baseline gap-3'>
									<span className='font-medium tracking-tight'>{custom.plan}</span>
									<span className='font-mono text-[11px] text-neutral-500'>{custom.note}</span>
								</div>
								<p className='mt-2 max-w-[46ch] text-sm leading-relaxed text-neutral-400'>
									Any number of devices from{' '}
									<b className='font-mono font-medium text-white'>{custom.devices}</b> to{' '}
									<b className='font-mono font-medium text-white'>{PLANS.custom.maxDevices}</b>, as
									many groups, and everything in {PLANS.fleet.label}.
								</p>
							</div>
							<div className='flex flex-wrap items-center gap-x-7 gap-y-4'>
								<div className='font-mono text-4xl tracking-[-0.045em]'>
									{custom.price}
									<span className='ml-1.5 text-xs tracking-normal text-neutral-500'>
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
					</div>
				</section>

				<section className='relative isolate overflow-hidden border-t border-white/10 py-20'>
					<UsageFleetMark className='pointer-events-none absolute -top-14 -right-48 size-[390px] text-[#111] sm:-right-24' />
					<div className='relative z-10 mb-12 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between'>
						<h2 className='text-4xl leading-[0.95] font-semibold tracking-[-0.04em] sm:text-5xl'>
							One account.
							<br />
							<span className='text-neutral-600'>Every group.</span>
						</h2>
						<p className='max-w-[40ch] text-sm leading-relaxed text-neutral-400'>
							Official utilization stays visible while UsageFleet shows where it came from.
						</p>
					</div>
					<div className='relative z-10 ml-auto w-full overflow-hidden border-y border-white/10 bg-black/80 lg:w-3/4'>
						<div className='flex flex-wrap gap-x-4 border-b border-white/10 px-4 py-2.5 font-mono text-xs text-neutral-500'>
							<span className='text-white'>example account</span>
							<span>5h window resets in 02:14</span>
							<span>weekly resets Mon 09:00</span>
						</div>
						{/* The five columns do not fit a phone; scroll them instead of shrinking. */}
						<div className='overflow-x-auto'>
							<table className='w-full min-w-[560px] font-mono text-[13px]'>
								<thead className='text-neutral-500'>
									<tr className='[&>th]:border-b [&>th]:border-white/10 [&>th]:px-4 [&>th]:py-2.5 [&>th]:text-right [&>th]:font-normal'>
										<th className='w-2/5 !text-left'>group</th>
										<th>devices</th>
										<th>5h</th>
										<th>weekly</th>
										<th>tokens 5h</th>
									</tr>
								</thead>
								<tbody className='[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-white/10 [&>tr>td]:px-4 [&>tr>td]:py-2.5 [&>tr>td]:text-right [&>tr>td:first-child]:text-left'>
									{EXAMPLE_GROUPS.map(group => (
										<tr key={group.name}>
											<td>
												{group.name}
												<Meter percent={group.session} />
											</td>
											<td className='text-neutral-500'>{group.devices}</td>
											<td>{group.session}%</td>
											<td>{group.weekly}%</td>
											<td>{millions(group.tokens)}</td>
										</tr>
									))}
									<tr>
										<td>
											Account
											<Meter percent={account.session} />
										</td>
										<td className='text-neutral-500'>{account.devices}</td>
										<td>{account.session}%</td>
										<td>{account.weekly}%</td>
										<td>{millions(account.tokens)}</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>
				</section>

				<section className='relative isolate overflow-hidden border-t border-white/10 py-20'>
					<UsageFleetMark className='pointer-events-none absolute -top-14 -left-44 size-[390px] text-[#111] sm:-left-36' />
					<h2 className='relative z-10 mb-12 text-4xl leading-[0.95] font-semibold tracking-[-0.04em] sm:text-5xl'>
						Small collector.
						<br />
						<span className='text-neutral-600'>Honest output.</span>
					</h2>
					<div className='relative z-10 w-full lg:w-3/4'>
						{SPECS.map(spec => (
							<div
								key={spec.key}
								className='grid gap-2 border-t border-white/10 py-6 last:border-b sm:grid-cols-[90px_1fr] sm:gap-7'
							>
								<span className='pt-1 font-mono text-xs text-neutral-500'>{spec.key}</span>
								<div>
									<h3 className='text-lg font-medium tracking-tight'>{spec.title}</h3>
									<p className='mt-1.5 max-w-[62ch] text-neutral-400'>{spec.body}</p>
								</div>
							</div>
						))}
					</div>
					<p className='relative z-10 mt-16 max-w-[28ch] text-2xl leading-tight tracking-tight'>
						Anthropic tells you one number.{' '}
						<span className='text-neutral-500'>UsageFleet tells you whose it was.</span>
					</p>
				</section>

				<section className='relative isolate overflow-hidden border-t border-white/10 py-20'>
					<UsageFleetMark className='pointer-events-none absolute -top-14 -right-48 size-[390px] text-[#111] sm:-right-24' />
					<div className='relative z-10 flex flex-wrap items-center justify-between gap-5'>
						{/* min-w-0: without it the nowrap command line stretches the flex row. */}
						<div className='min-w-0'>
							<h2 className='text-3xl font-semibold tracking-[-0.03em]'>Install it in about a minute.</h2>
							<code className='mt-3 block overflow-x-auto font-mono text-xs whitespace-nowrap text-neutral-500'>
								{INSTALL_COMMAND}
							</code>
						</div>
						<Link to={signedIn ? '/dashboard' : '/login'} className={buttonVariants({ size: 'lg' })}>
							{signedIn ? 'Open dashboard' : 'Get started'}
						</Link>
					</div>
				</section>

				<footer className='flex justify-between border-t border-white/10 py-5 pb-10 font-mono text-xs text-neutral-500'>
					<span className='flex items-center gap-2'>
						<UsageFleetMark className='size-3.5' />
						USAGEFLEET
					</span>
					<span>MACOS / LINUX / WINDOWS</span>
				</footer>
			</div>
		</div>
	)
}

function Meter({ percent }: { percent: number }) {
	return (
		<span className='mt-1.5 block h-1 rounded-full bg-white/10'>
			<span className='block h-full rounded-full bg-white' style={{ width: `${percent}%` }} />
		</span>
	)
}
