import { createFileRoute } from '@tanstack/react-router'
import { Bullets, Clause, LegalPage } from '@/components/legal-page'
import { CONTACT_EMAIL, OPERATOR, UPDATED } from '@/lib/legal'
import { FREE_DEVICES, PLANS } from '@/lib/plans'
import { SITE_NAME, siteUrl } from '@/lib/site'

const TITLE = `Terms — ${SITE_NAME}`
const DESCRIPTION = `The terms you agree to by using ${SITE_NAME}: plans, billing, limits and liability.`

export const Route = createFileRoute('/terms')({
	head: () => {
		const url = `${siteUrl()}/terms`
		return {
			meta: [
				{ title: TITLE },
				{ name: 'description', content: DESCRIPTION },
				{ property: 'og:title', content: TITLE },
				{ property: 'og:description', content: DESCRIPTION },
				{ property: 'og:url', content: url },
			],
			links: [{ rel: 'canonical', href: url }],
		}
	},
	component: Terms,
})

function Terms() {
	return (
		<LegalPage title='Terms' updated={UPDATED}>
			<Clause title='Who you are agreeing with'>
				<p>
					{SITE_NAME} is operated by {OPERATOR}. Using the hosted service at usagefleet.com means you accept
					these terms. If you run the server yourself under its licence, these terms do not apply to you, the
					licence does.
				</p>
			</Clause>

			<Clause title='What the service does'>
				<p>
					{SITE_NAME} collects Claude Code usage from the machines you connect and shows it per device and per
					group. The 5-hour and weekly percentages are the ones Anthropic reports; we split them across your
					groups by their share of estimated cost. Token counts and cost estimates are our own arithmetic and
					are for information only, not a bill.
				</p>
				<p className='text-foreground'>
					{SITE_NAME} is not affiliated with, endorsed by or sponsored by Anthropic. Claude and Claude Code
					are their trademarks. Your use of Claude stays governed by your agreement with them.
				</p>
			</Clause>

			<Clause title='Your account'>
				<p>
					One person, one account. Keep your credentials and device tokens to yourself: a device token uploads
					usage under your account until you delete the device, and a token is shown only once, so treat it
					like a password. You are responsible for what happens under your account and for having the right to
					report usage from the machines you connect.
				</p>
			</Clause>

			<Clause title='Plans and limits'>
				<p>Plans differ by how many devices and groups you may register:</p>
				<Bullets
					items={[
						`Free: ${FREE_DEVICES} device.`,
						`${PLANS.solo.label}: ${PLANS.solo.devices} devices.`,
						`${PLANS.fleet.label}: ${PLANS.fleet.devices} devices.`,
						`${PLANS.custom.label}: from ${PLANS.custom.minDevices} to ${PLANS.custom.maxDevices} devices, priced per device.`,
					]}
				/>
				<p>
					Devices beyond your plan stop being accepted rather than being billed. If you downgrade, devices
					over the new limit are parked: they keep their history and stop reporting until you delete some or
					upgrade again.
				</p>
			</Clause>

			<Clause title='Billing'>
				<p>
					Paid plans are billed monthly in advance through Stripe, in the currency shown at checkout, taxes on
					top where they apply. Prices can change with 30 days notice by email; the new price starts at your
					next renewal.
				</p>
				<p>
					You can cancel any time from the billing portal. The plan then runs to the end of the period you
					already paid for and does not renew, and the account falls back to Free rather than being deleted.
					Payments already made are not refunded, including for partial months and for time you did not use.
					If a payment fails, the account is downgraded rather than suspended.
				</p>
			</Clause>

			<Clause title='Acceptable use'>
				<Bullets
					items={[
						'Do not report usage you did not generate, or forge records to misrepresent them.',
						'Do not attempt to reach another account’s data, or to bypass rate limits, plan limits or authentication.',
						'Do not resell the service or run it as a service for third parties without asking first.',
						'Do not attack the service: automated hammering, scraping the API outside the collector, or anything that degrades it for others.',
					]}
				/>
				<p>
					Break these and the account can be suspended or closed, with a refund of nothing but the obligation
					to say why.
				</p>
			</Clause>

			<Clause title='Availability'>
				<p>
					The service is provided as it is, without an uptime guarantee. Maintenance, upgrades and failures
					happen. The collector is built to survive them: it queues locally and uploads once the server
					answers again, and <code className='font-mono'>usagefleet guard</code> deliberately fails open, so
					an outage here never blocks your work.
				</p>
				<p>
					We can change or discontinue features. If the service is shut down entirely, account holders get at
					least 30 days notice by email and no further charge.
				</p>
			</Clause>

			<Clause title='Liability'>
				<p>
					The numbers on the dashboard are estimates derived from your local logs and Anthropic’s headers. Do
					not use them as the only basis for a decision that costs money. To the extent the law allows,{' '}
					{SITE_NAME} is not liable for indirect or consequential damage, lost profit, lost data or work
					blocked by a limit you were not warned about, and total liability is capped at what you paid in the
					twelve months before the claim.
				</p>
				<p>Nothing here limits rights you have as a consumer that cannot be limited by agreement.</p>
			</Clause>

			<Clause title='The CLI is open source'>
				<p>
					The collector is published as <code className='font-mono'>@usagefleet/cli</code> under the
					GPL-3.0-or-later licence. That licence governs the software itself, including its warranty
					disclaimer, and nothing on this page takes away a right it grants you.
				</p>
			</Clause>

			<Clause title='Changes and governing law'>
				<p>
					These terms can change; the date at the top moves with them and material changes are announced by
					email before they take effect. Polish law applies, and disputes go to the courts with jurisdiction
					over the operator, unless consumer law gives you a different court.
				</p>
				<p>
					Questions:{' '}
					<a href={`mailto:${CONTACT_EMAIL}`} className='text-foreground underline underline-offset-4'>
						{CONTACT_EMAIL}
					</a>
					.
				</p>
			</Clause>
		</LegalPage>
	)
}
