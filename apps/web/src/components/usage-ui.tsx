import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

/** A dashboard section: hairline rule, small label, controls on the right. Used
 *  instead of Card so the page reads as one continuous sheet of numbers. */
export function Section({
	title,
	actions,
	children,
}: {
	title: string
	actions?: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<section className='border-t pt-4'>
			<div className='flex flex-wrap items-center justify-between gap-x-4 gap-y-2'>
				<h2 className='text-[11px] font-medium tracking-wider text-muted-foreground uppercase'>{title}</h2>
				{actions}
			</div>
			<div className='mt-3'>{children}</div>
		</section>
	)
}

/** A limit bar: neutral up to 70%, amber past it, destructive past 90% — so a
 *  group that is about to eat its budget is visible without reading numbers. */
export function UsageBar({ pct, className }: { pct: number; className?: string }) {
	const value = Math.min(100, Math.max(0, pct))
	return (
		<Progress
			value={value}
			aria-label={`${value}% used`}
			className={cn(
				'[&_[data-slot=progress-track]]:h-1.5',
				pct >= 90 && '[&_[data-slot=progress-indicator]]:bg-destructive',
				pct >= 70 && pct < 90 && '[&_[data-slot=progress-indicator]]:bg-amber-500',
				className,
			)}
		/>
	)
}
