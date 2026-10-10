import { useState, useTransition } from 'react'
import { useRouter } from '@tanstack/react-router'
import { useTranslations } from 'use-intl'
import type { FormAction } from '@/components/ActionForm'
import { Button } from '@/components/arc/button/button'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/arc/dialog/dialog'
import { useToast } from '@/components/arc/toast-stack/toast-stack'

/** Confirm-then-run wrapper for the irreversible actions (revoke/delete). The
 *  action is invoked in a transition rather than by submitting a form inside
 *  the dialog, so the dialog stays mounted until the round-trip finishes. */
export function ConfirmAction({
	action,
	id,
	title,
	description,
	confirmLabel,
	successMessage,
	children,
}: {
	/** Server function taking a FormData with a single `id` field. */
	action: FormAction
	id: string
	title: string
	description: string
	confirmLabel: string
	successMessage: string
	/** Trigger button content. */
	children: React.ReactNode
}) {
	const t = useTranslations('dash.actions')
	const [open, setOpen] = useState(false)
	const [pending, startTransition] = useTransition()
	const router = useRouter()
	const toast = useToast()
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={<Button variant='ghost' size='sm' />}>{children}</DialogTrigger>
			<DialogContent title={title} description={description}>
				<div className='flex justify-end gap-2'>
					<DialogClose render={<Button variant='secondary' disabled={pending} />}>{t('cancel')}</DialogClose>
					<Button
						variant='danger'
						loading={pending}
						onClick={() =>
							startTransition(async () => {
								const fd = new FormData()
								fd.set('id', id)
								try {
									await toast.promise(
										action({ data: fd }).then(() => router.invalidate()),
										{
											error: { description: t('retry'), title: t('failedTitle') },
											loading: { title: t('working') },
											success: { title: successMessage },
										},
									)
									setOpen(false)
								} catch {
									// The toast reports the error; keep the dialog open for retry.
								}
							})
						}
					>
						{confirmLabel}
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	)
}
