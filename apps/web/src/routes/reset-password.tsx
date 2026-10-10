import type { FormEvent } from 'react'
import { useState } from 'react'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import { Button } from '@/components/arc/button/button'
import { Card } from '@/components/arc/card/card'
import { Input } from '@/components/arc/input/input'
import { PasswordField } from '@/components/arc/password-field/password-field'
import { authClient } from '@/lib/auth-client'
import { detectLocale } from '@/lib/i18n'
import { SITE_NAME } from '@/lib/site'
import { MESSAGES } from '@/messages'

/** Both halves of a reset live on this one path, because that is what the mail
 *  link forces: better-auth's /reset-password/:token callback checks the token
 *  and bounces here with ?token= or ?error=INVALID_TOKEN. Landing here without
 *  either means the visitor came from the "forgot password" link instead, so
 *  the page asks for an address. `token` is passed straight back to the server,
 *  which is the only thing that can judge it. */
function validateSearch(search: Record<string, unknown>): { token?: string; error?: string } {
	const token = Array.isArray(search.token) ? search.token[0] : search.token
	const error = Array.isArray(search.error) ? search.error[0] : search.error
	return {
		token: typeof token === 'string' ? token : undefined,
		error: typeof error === 'string' ? error : undefined,
	}
}

export const Route = createFileRoute('/reset-password')({
	validateSearch,
	// A one-time token in the URL has no business in a search index.
	head: () => ({
		meta: [
			{ title: `${MESSAGES[detectLocale()].auth.title.reset} — ${SITE_NAME}` },
			{ name: 'robots', content: 'noindex, nofollow' },
		],
	}),
	component: ResetPasswordPage,
})

function ResetPasswordPage() {
	const t = useTranslations('auth.reset')
	const { token, error: linkError } = Route.useSearch()
	return (
		<div className='flex flex-1 items-center justify-center p-6'>
			<Card
				className='w-full max-w-sm'
				title={token ? t('titleToken') : t('title')}
				description={token ? t('descriptionToken') : t('description')}
			>
				<div className='mt-6 flex flex-col gap-6'>
					{linkError && (
						<p role='alert' className='text-sm text-destructive'>
							{t('linkExpired')}
						</p>
					)}
					{token && !linkError ? <NewPasswordForm token={token} /> : <RequestLinkForm />}
					<Link to='/login' className='text-center text-sm text-muted-foreground'>
						{t('backTo')}
						<span className='font-medium text-foreground underline underline-offset-4'>
							{t('backToSignIn')}
						</span>
					</Link>
				</div>
			</Card>
		</div>
	)
}

/** Step one. The server answers the same way whether or not the address exists,
 *  so this must not branch on the result either: telling the two apart here
 *  would hand back the account enumeration better-auth deliberately withholds. */
function RequestLinkForm() {
	const t = useTranslations('auth.reset')
	const [pending, setPending] = useState(false)
	const [sent, setSent] = useState(false)

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		await authClient.requestPasswordReset({
			email: String(new FormData(event.currentTarget).get('email')),
			redirectTo: '/reset-password',
		})
		setPending(false)
		setSent(true)
	}

	if (sent) {
		return <output className='text-sm text-muted-foreground'>{t('sent')}</output>
	}

	return (
		<form onSubmit={onSubmit} className='grid gap-5'>
			{/* The username is no use here: only an address can be mailed. */}
			<Input
				label={t('email')}
				name='email'
				type='email'
				required
				autoComplete='email'
				placeholder={t('emailPlaceholder')}
			/>
			<Button type='submit' size='lg' loading={pending}>
				{t('sendLink')}
			</Button>
		</form>
	)
}

/** Step two, reached only from the mail link. */
function NewPasswordForm({ token }: { token: string }) {
	const t = useTranslations('auth.reset')
	const tForm = useTranslations('auth.form')
	const router = useRouter()
	const [pending, setPending] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function onSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault()
		setPending(true)
		setError(null)
		const { error } = await authClient.resetPassword({
			newPassword: String(new FormData(event.currentTarget).get('password')),
			token,
		})
		setPending(false)
		if (error) {
			setError(error.message ?? t('invalidToken'))
			return
		}
		// Resetting does not sign anyone in, by design: the new password still has
		// to be typed once at the form that knows about usernames and providers.
		await router.navigate({ to: '/login' })
	}

	return (
		<form onSubmit={onSubmit} className='grid gap-5'>
			<PasswordField
				label={t('newPassword')}
				name='password'
				required
				minLength={8}
				autoComplete='new-password'
				placeholder={t('passwordPlaceholder')}
				messages={{ hidePassword: tForm('hidePassword'), showPassword: tForm('showPassword') }}
			/>
			{error && (
				<p role='alert' className='text-sm text-destructive'>
					{error}
				</p>
			)}
			<Button type='submit' size='lg' loading={pending}>
				{t('setPassword')}
			</Button>
		</form>
	)
}
