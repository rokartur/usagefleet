import { useTransition } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import { useToast } from '@/components/arc/toast-stack/toast-stack'

/** Structural shape of a `createServerFn` fetcher that takes a FormData. Kept
 *  structural (not the generated fetcher type) so the forms don't have to name
 *  one specific server function. */
export type FormAction = (opts: { data: FormData }) => Promise<unknown>

type ActionFormProps = Omit<React.ComponentProps<'form'>, 'action'> & {
	action: FormAction
	loadingMessage: string
	successMessage: string
	errorMessage?: string
	onSuccess?: () => void
}

/** A server-function form that reports its promise state through the global
 *  toast and refetches the route's loaders on success (the replacement for
 *  Next's revalidatePath). */
export function ActionForm({
	action,
	loadingMessage,
	successMessage,
	errorMessage,
	onSuccess,
	...props
}: ActionFormProps) {
	const [pending, startTransition] = useTransition()
	const router = useRouter()
	const t = useTranslations('dash.actions')
	const toast = useToast()

	return (
		<form
			{...props}
			aria-busy={pending}
			onSubmit={event => {
				event.preventDefault()
				const formData = new FormData(event.currentTarget)
				startTransition(async () => {
					try {
						await toast.promise(
							action({ data: formData }).then(() => router.invalidate()),
							{
								error: { title: errorMessage ?? t('failed') },
								loading: { title: loadingMessage },
								success: { title: successMessage },
							},
						)
						onSuccess?.()
					} catch {
						// The toast reports the error; leave the form available for retry.
					}
				})
			}}
		/>
	)
}
