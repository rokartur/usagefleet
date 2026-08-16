import { createFileRoute } from '@tanstack/react-router'
import { Bullets, Clause, LegalPage } from '@/components/legal-page'
import { CONTACT_EMAIL, OPERATOR, UPDATED } from '@/lib/legal'
import { SITE_NAME, siteUrl } from '@/lib/site'

const TITLE = `Privacy — ${SITE_NAME}`
const DESCRIPTION = `What the ${SITE_NAME} collector sends, what the account stores, and how to get rid of both.`

export const Route = createFileRoute('/privacy')({
	head: () => {
		const url = `${siteUrl()}/privacy`
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
	component: Privacy,
})

// The field lists here are the ones in apps/cli/src/types.ts and
// apps/web/src/db/schema.ts. Change either and this page is wrong.
function Privacy() {
	return (
		<LegalPage title='Privacy' updated={UPDATED}>
			<Clause title='Who is responsible'>
				<p>
					{SITE_NAME} is operated by {OPERATOR}, who is the controller of the personal data described here.
					Questions, requests and complaints go to{' '}
					<a href={`mailto:${CONTACT_EMAIL}`} className='text-foreground underline underline-offset-4'>
						{CONTACT_EMAIL}
					</a>
					.
				</p>
				<p>
					This page covers the hosted service at usagefleet.com. If you run the server yourself, you are the
					controller of your own instance and none of the data reaches us.
				</p>
			</Clause>

			<Clause title='What the collector sends'>
				<p>
					The CLI reads the log files Claude Code, Claude Desktop and the pi agent already write on your
					machine, and uploads one record per assistant message:
				</p>
				<Bullets
					items={[
						'Token counts: input, output, cache creation and cache read.',
						'The model name, the service tier, and the message, request and session identifiers.',
						'The timestamp of the message.',
						'The working directory path and the git branch checked out in it.',
						'The machine hostname, the operating system, and the collector version.',
						'The Claude account identifier from your local Claude config, so usage lands on the right subscription.',
						'The 5-hour and weekly utilization percentages Anthropic returns in its own response headers.',
					]}
				/>
				<p className='text-foreground'>
					It never sends prompts, responses, file contents, file names, environment variables or anything else
					from the session. The uploader has no code that can read them.
				</p>
				<p>
					The working directory and branch are the exception worth naming twice: a path can carry a client or
					project name. They are stored so the dashboard can attribute spend to a project, and they are
					deleted with the device.
				</p>
			</Clause>

			<Clause title='What the account stores'>
				<Bullets
					items={[
						'Your email address and display name, from GitHub, Google or the address you signed up with.',
						'A password hash, if you signed up with an email and password.',
						'Session records so you stay signed in.',
						'The device and group names you type, and a SHA-256 hash of each device token. The token itself is shown once and never stored.',
						'Your Stripe customer and subscription identifiers, plan and status. Card details never touch our server.',
					]}
				/>
			</Clause>

			<Clause title='Why we are allowed to hold it'>
				<p>
					Usage records, devices, groups and account details are processed to deliver the service you signed
					up for, which is performance of a contract under Article 6(1)(b) GDPR. Rate limiting, token hashing
					and abuse prevention rest on our legitimate interest in keeping the service working, Article
					6(1)(f). Billing records are kept because tax law says to, Article 6(1)(c).
				</p>
			</Clause>

			<Clause title='Who else sees it'>
				<Bullets
					items={[
						'Stripe, for payments and the billing portal.',
						'Resend, to deliver verification and password reset email.',
						'GitHub and Google, only if you choose to sign in with them, and only the sign-in exchange itself.',
						'The infrastructure the server and its database run on.',
					]}
				/>
				<p>
					That is the whole list. There are no analytics scripts, no advertising pixels and no third-party
					trackers on this site, and your data is never sold or shared for marketing. Some of these providers
					operate in the United States, under the standard contractual clauses their terms include.
				</p>
			</Clause>

			<Clause title='Cookies'>
				<p>
					One cookie, for your session. It is what keeps you signed in, and there is no version of the app
					that works without it. Your theme choice is kept in your browser and never sent to us.
				</p>
			</Clause>

			<Clause title='How long it is kept'>
				<p>
					Usage records stay until you delete the device they came from, or the account. Deleting a device
					removes its records; deleting a group leaves its devices ungrouped rather than deleting anything.
					Invoices and payment records live in Stripe for as long as accounting rules require.
				</p>
			</Clause>

			<Clause title='Deleting everything'>
				<p>
					Settings has a delete button. It removes the account and, by cascade, every device, group, usage
					record, limit sample and session attached to it. An active paid plan has to be cancelled first:
					nothing on our side can cancel a Stripe subscription for an account that no longer exists, so the
					delete is refused rather than leaving a card being charged.
				</p>
				<p>
					To stop reporting without deleting anything, run{' '}
					<code className='font-mono'>usagefleet uninstall</code> on the machine, or delete the device in the
					dashboard, which makes its token useless immediately.
				</p>
			</Clause>

			<Clause title='Your rights'>
				<p>
					You can ask for a copy of your data, correct it, have it erased, restrict or object to processing,
					and receive it in a portable format. Email{' '}
					<a href={`mailto:${CONTACT_EMAIL}`} className='text-foreground underline underline-offset-4'>
						{CONTACT_EMAIL}
					</a>{' '}
					and you get an answer within a month. If the answer is unsatisfactory you can complain to the Polish
					data protection authority, the Prezes Urzędu Ochrony Danych Osobowych.
				</p>
			</Clause>

			<Clause title='Changes'>
				<p>
					If this page changes in a way that affects what is collected, the date at the top changes with it
					and account holders are told by email. Everything else is a wording fix.
				</p>
			</Clause>
		</LegalPage>
	)
}
