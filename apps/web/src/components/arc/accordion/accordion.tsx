'use client'

import type { ReactNode } from 'react'
import { Accordion as AccordionPrimitive } from '@base-ui/react/accordion'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const styles = {
	accordion: 'w-full border-t',
	item: 'border-b',
	header: 'm-0',
	trigger:
		'group/trigger flex min-h-(--control-height-lg) w-full cursor-pointer items-center justify-between gap-5 py-2 text-left text-sm leading-(--leading-body) font-medium text-(--foreground) transition-colors duration-(--duration-fast) ease-(--ease-standard) [-webkit-tap-highlight-color:transparent] hover:text-(--text-secondary) motion-reduce:transition-none',
	icon: 'inline-flex flex-none text-(--text-muted) [transition:color_var(--duration-fast)_var(--ease-standard),rotate_var(--duration-spring)_var(--ease-spring)] group-hover/trigger:text-(--foreground) group-data-panel-open/trigger:rotate-180 group-data-panel-open/trigger:text-(--foreground) motion-reduce:transition-none',
	// Base UI measures the panel into --accordion-panel-height, so a toggle mid-flight reverses from where it is.
	panel: 'group/panel h-(--accordion-panel-height) overflow-hidden text-sm leading-(--leading-body) text-(--text-secondary) [transition:height_var(--duration-considered)_var(--ease-enter),opacity_var(--duration-standard)_var(--ease-enter)] data-ending-style:h-0 data-ending-style:opacity-0 data-ending-style:[transition:height_var(--duration-standard)_var(--ease-standard),opacity_var(--duration-fast)_var(--ease-standard)] data-starting-style:h-0 data-starting-style:opacity-0 motion-reduce:transition-none',
	// The answer settles down into place with a brief focus pull as the panel opens.
	panelInner:
		'pr-8 pb-5 [overflow-wrap:anywhere] [transition:translate_var(--duration-considered)_var(--ease-enter),filter_var(--duration-standard)_var(--ease-enter)] group-data-ending-style/panel:-translate-y-1.5 group-data-ending-style/panel:blur-[2px] group-data-starting-style/panel:-translate-y-1.5 group-data-starting-style/panel:blur-[2px] motion-reduce:transition-none',
	lgTrigger: 'min-h-19 gap-8 py-5 text-lg tracking-(--tracking-body) max-[520px]:min-h-17 max-[520px]:text-base',
	lgPanel: 'text-base leading-[1.65] max-[520px]:text-sm',
	lgPanelInner: 'max-w-[62ch] pr-12 pb-6 max-[520px]:pr-6',
}

export interface AccordionItem {
	value: string
	title: ReactNode
	content: ReactNode
}

export interface AccordionProps {
	items: AccordionItem[]
	/** Value of the item open on first render; all start closed without it. */
	defaultOpen?: string
	/** "lg" suits page-level FAQs: questions at the large text size, answers at body size. */
	size?: 'md' | 'lg'
	className?: string
}

/** One item open at a time. Closed panels stay in the page as hidden-until-found, so find-in-page and crawlers still reach them. */
export function Accordion({ items, defaultOpen, size = 'md', className }: AccordionProps) {
	const lg = size === 'lg'
	return (
		<AccordionPrimitive.Root
			className={cn(styles.accordion, className)}
			defaultValue={defaultOpen === undefined ? [] : [defaultOpen]}
			hiddenUntilFound
		>
			{items.map(item => (
				<AccordionPrimitive.Item key={item.value} value={item.value} className={styles.item}>
					<AccordionPrimitive.Header className={styles.header}>
						<AccordionPrimitive.Trigger className={cn(styles.trigger, lg && styles.lgTrigger)}>
							<span className='min-w-0 flex-1'>{item.title}</span>
							<span className={styles.icon}>
								<ChevronDown size={17} aria-hidden='true' />
							</span>
						</AccordionPrimitive.Trigger>
					</AccordionPrimitive.Header>
					<AccordionPrimitive.Panel className={cn(styles.panel, lg && styles.lgPanel)}>
						<div className={cn(styles.panelInner, lg && styles.lgPanelInner)}>{item.content}</div>
					</AccordionPrimitive.Panel>
				</AccordionPrimitive.Item>
			))}
		</AccordionPrimitive.Root>
	)
}

export default Accordion
