'use client'

import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { motionTokens } from '../lib/motion-tokens'

export interface BreadcrumbItem {
	label: string
	href?: LinkProps['to']
}

export interface BreadcrumbProps {
	items: BreadcrumbItem[]
	ariaLabel: string
}

// Each crumb reserves the width of its medium weight label, so becoming the current page never shifts the path.
const crumb =
	'inline-flex flex-col rounded-[7px] px-[2px] py-[4px] after:pointer-events-none after:invisible after:h-0 after:overflow-hidden after:font-medium after:select-none after:content-[attr(data-label)]'
const link = `${crumb} text-(--text-secondary) underline decoration-transparent decoration-1 underline-offset-4 transition-[color,text-decoration-color] duration-(--duration-fast) ease-(--ease-standard) hover:text-(--accent-strong) hover:decoration-[color-mix(in_oklab,currentColor_45%,transparent)] motion-reduce:transition-none`
const current = `${crumb} font-medium text-(--accent-strong)`

/** Crumbs present on first render stay still; crumbs added later slide in from the path before them. */
export function Breadcrumb({ items, ariaLabel }: BreadcrumbProps) {
	const reduced = useReducedMotion() ?? false
	const still = { duration: 0 }
	const path = items.map(item => item.label).join('/')
	return (
		<nav aria-label={ariaLabel} className='min-w-0'>
			{/* The gap between crumbs matches the gap inside one, so every chevron sits centered between its two labels. */}
			<ol className='relative m-0 flex list-none flex-wrap items-center gap-x-[6px] gap-y-[2px] p-0'>
				<AnimatePresence mode='popLayout' initial={false}>
					{items.map((item, index) => {
						const isCurrent = index === items.length - 1
						return (
							<motion.li
								key={`${item.label}-${index}`}
								className='inline-flex items-center gap-[6px] text-sm leading-(--leading-body) whitespace-nowrap text-(--text-muted)'
								layout={reduced ? false : 'position'}
								layoutDependency={path}
								initial={
									reduced
										? false
										: { opacity: 0, x: -8, filter: `blur(${motionTokens.blur.subtle}px)` }
								}
								animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
								exit={
									reduced
										? { opacity: 0, transition: still }
										: {
												opacity: 0,
												x: -4,
												filter: `blur(${motionTokens.blur.subtle}px)`,
												transition: {
													duration: motionTokens.duration.instant,
													ease: [...motionTokens.ease.standard],
												},
											}
								}
								transition={
									reduced
										? still
										: {
												duration: motionTokens.duration.standard,
												ease: [...motionTokens.ease.enter],
												layout: motionTokens.spring.smooth,
											}
								}
							>
								{index > 0 && (
									<ChevronRight
										size={16}
										strokeWidth={1.75}
										className='flex-none text-(--border-strong)'
										aria-hidden='true'
									/>
								)}
								{!isCurrent && item.href ? (
									<Link to={item.href} className={link} data-label={item.label}>
										{item.label}
									</Link>
								) : (
									<span
										className={isCurrent ? current : crumb}
										aria-current={isCurrent ? 'page' : undefined}
										data-label={item.label}
									>
										{item.label}
									</span>
								)}
							</motion.li>
						)
					})}
				</AnimatePresence>
			</ol>
		</nav>
	)
}

export default Breadcrumb
