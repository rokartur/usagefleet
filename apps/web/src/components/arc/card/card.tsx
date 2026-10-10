import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
	title: string
	description?: string
}

export function Card({ title, description, className, children, ...props }: CardProps) {
	return (
		<article
			{...props}
			className={cn(
				'relative isolate min-w-0 overflow-hidden rounded-(--radius-panel) border bg-(--surface) text-(--foreground) [transition:border-color_var(--duration-fast)_var(--ease-standard),box-shadow_var(--duration-standard)_var(--ease-standard),translate_var(--duration-spring)_var(--ease-spring)] hover:-translate-y-0.5 hover:border-(--border-strong) hover:shadow-(--shadow-raised) motion-reduce:hover:translate-y-0',
				className,
			)}
		>
			<div className='p-5'>
				<h3 className='m-0 w-fit max-w-full text-lg leading-[1.3] font-medium tracking-(--tracking-body) text-balance'>
					{title}
				</h3>
				{description ? (
					<p className='mt-2 max-w-[34ch] text-sm leading-(--leading-body) text-pretty text-(--text-secondary)'>
						{description}
					</p>
				) : null}
				{children}
			</div>
		</article>
	)
}

export default Card
