'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
	animate,
	motion,
	useInView,
	useMotionValue,
	useMotionValueEvent,
	useReducedMotion,
	useTransform,
} from 'motion/react'
import { motionTokens } from '../lib/motion-tokens'

const styles = {
	svg: 'block overflow-visible',
	// The area under the line carries a faint wash of the line tone.
	area: 'fill-[color-mix(in_oklab,var(--accent)_9%,transparent)] stroke-none',
	line: 'fill-none stroke-(--accent) stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]',
	end: 'fill-none stroke-(--accent) [stroke-linecap:round]',
}

export interface SparklineProps {
	data: number[]
	width?: number
	height?: number
}

/** The first draw: one smooth stroke, slow at both ends like a pen. */
const draw = { duration: motionTokens.duration.considered * 1.75, ease: [...motionTokens.ease.inOut] } as const
const quick = { duration: motionTokens.duration.fast, ease: [...motionTokens.ease.standard] } as const

type Point = [number, number]
/** Space kept above the highest and below the lowest point. */
const INSET = 3
const GRID = Array.from({ length: 161 }, (_, index) => index / 160)

/** A smooth line through every point, sampled densely in unit space (x and y both 0 to 1, y up). Monotone cubic tangents keep it from swinging past the data. */
function curveFor(data: number[]): Point[] {
	const min = Math.min(...data)
	const span = Math.max(...data) - min
	const ys = data.map(value => (span ? (value - min) / span : 0.5))
	const last = ys.length - 1
	const step = 1 / last
	const slopes = ys.slice(1).map((y, index) => (y - ys[index]) / step)
	const tangents = ys.map((_, index) =>
		index === 0 || index === last
			? slopes[0]
			: (Math.sign(slopes[index - 1]) + Math.sign(slopes[index])) *
					Math.min(
						Math.abs(slopes[index - 1]),
						Math.abs(slopes[index]),
						Math.abs(slopes[index - 1] + slopes[index]) / 4,
					) || 0,
	)
	if (last > 1) {
		tangents[0] = (3 * slopes[0] - tangents[1]) / 2
		tangents[last] = (3 * slopes[last - 1] - tangents[last - 1]) / 2
	}
	const samples = Math.max(1, Math.min(16, Math.round(128 / last)))
	const points: Point[] = []
	for (let index = 0; index < last; index++) {
		for (let sample = 0; sample < samples; sample++) {
			const t = sample / samples
			const t2 = t * t
			const t3 = t2 * t
			const y =
				(2 * t3 - 3 * t2 + 1) * ys[index] +
				(t3 - 2 * t2 + t) * step * tangents[index] +
				(3 * t2 - 2 * t3) * ys[index + 1] +
				(t3 - t2) * step * tangents[index + 1]
			points.push([(index + t) * step, Math.min(1, Math.max(0, y))])
		}
	}
	points.push([1, ys[last]])
	return points
}

/** Height of the sampled line at x, straight between samples. */
function heightAt(shape: Point[], x: number) {
	let low = 0
	let high = shape.length - 1
	if (x <= shape[low][0]) {
		return shape[low][1]
	}
	if (x >= shape[high][0]) {
		return shape[high][1]
	}
	while (high - low > 1) {
		const middle = (low + high) >> 1
		if (shape[middle][0] < x) {
			low = middle
		} else {
			high = middle
		}
	}
	const [x0, y0] = shape[low]
	const [x1, y1] = shape[high]
	return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
}

/** Every drawn string for one frame, in the chart's own pixels so strokes and the dot stay round. */
function geometryOf(shape: Point[], w: number, h: number) {
	const toY = (y: number) => INSET + (1 - y) * (h - INSET * 2)
	const points = shape.map(([x, y]): Point => [x * w, toY(y)])
	const pairs = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
	const end = `${w},${toY(heightAt(shape, 1))}`
	return { points, line: pairs.join(' '), fill: `M${pairs.join('L')}L${w},${h}L0,${h}Z`, dot: `${end} ${end}` }
}

/** Where the pen is along the line once `progress` of its length is drawn, so the fill follows the tip. */
function tipAt(points: Point[], progress: number) {
	const steps = points.slice(1).map(([x, y], index) => Math.hypot(x - points[index][0], y - points[index][1]))
	let left = progress * steps.reduce((sum, step) => sum + step, 0)
	let tip = points[0][0]
	for (let index = 0; index < steps.length; index++) {
		const step = steps[index]
		const to = points[index + 1][0]
		if (left <= step) {
			return tip + (to - tip) * (step ? left / step : 1)
		}
		left -= step
		tip = to
	}
	return tip
}

/** Arc's sparkline cut down to the line for a table cell: no caption and no scrubbing, since the row carries the numbers. */
export function Sparkline({ data, width = 90, height = 20 }: SparklineProps) {
	const safeData = data.length > 1 ? data : [data[0] ?? 0, data[0] ?? 0]
	const key = safeData.join(',')
	const target = useMemo(() => curveFor(key.split(',').map(Number)), [key])
	const uid = `sparkline${useId().replaceAll(/[^a-zA-Z0-9_-]/g, '')}`
	const ref = useRef<SVGSVGElement>(null)
	const inView = useInView(ref, { once: true, amount: 0.5 })
	const reduceMotion = Boolean(useReducedMotion())
	const [landed, setLanded] = useState(false)

	const [first] = useState(() => geometryOf(target, width, height))
	const shape = useRef(target)
	const drawn = useMotionValue(0)
	const line = useMotionValue(first.line)
	const fill = useMotionValue(first.fill)
	const dot = useMotionValue(first.dot)
	const reveal = useMotionValue(0)
	const lineOpacity = useTransform(drawn, progress => (progress > 0.001 ? 1 : 0))

	// One writer for every drawn attribute: the morphing shape and the pen both repaint through here.
	const paint = useCallback(() => {
		const progress = drawn.get()
		const next = geometryOf(shape.current, width, height)
		line.set(next.line)
		fill.set(next.fill)
		dot.set(next.dot)
		reveal.set(progress >= 1 ? width + 32 : tipAt(next.points, progress) + 16)
	}, [dot, drawn, fill, height, line, reveal, width])
	useMotionValueEvent(drawn, 'change', paint)

	// The line draws left to right once it is seen, the fill follows the pen, then the end dot lands.
	useEffect(() => {
		// Reduced motion shows the finished line at once; the dot lands a frame later, after hydration has matched the server.
		if (reduceMotion) {
			drawn.jump(1)
			const frame = requestAnimationFrame(() => setLanded(true))
			return () => cancelAnimationFrame(frame)
		}
		if (!inView) {
			return
		}
		const controls = animate(drawn, 1, { ...draw, onComplete: () => setLanded(true) })
		return () => controls.stop()
	}, [drawn, inView, reduceMotion])

	// New data morphs the line from the shape on screen, sampled on shared x positions so a series that gains or loses points still flows.
	useEffect(() => {
		const from = shape.current
		if (from === target) {
			return
		}
		if (reduceMotion) {
			shape.current = target
			paint()
			return
		}
		const xs = [...new Set([...GRID, ...target.map(([x]) => x)])].toSorted((a, b) => a - b)
		const start = xs.map(x => heightAt(from, x))
		const goal = xs.map(x => heightAt(target, x))
		const controls = animate(0, 1, {
			...motionTokens.spring.smooth,
			onUpdate: progress => {
				shape.current = xs.map((x, at): Point => [x, start[at] + (goal[at] - start[at]) * progress])
				paint()
			},
			onComplete: () => {
				shape.current = target
				paint()
			},
		})
		return () => controls.stop()
	}, [paint, reduceMotion, target])

	return (
		<svg
			ref={ref}
			className={styles.svg}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			aria-hidden='true'
			focusable='false'
		>
			<defs>
				<clipPath id={`${uid}-fill`} clipPathUnits='userSpaceOnUse'>
					<motion.rect x={-16} y={-16} width={reveal} height={height + 32} />
				</clipPath>
			</defs>
			<motion.path className={styles.area} d={fill} clipPath={`url(#${uid}-fill)`} />
			<motion.polyline
				className={styles.line}
				points={line}
				style={{ pathLength: drawn, opacity: lineOpacity }}
			/>
			{/* A zero-length round-capped stroke is a true circle, and it takes the line's colour. It rests on the latest point. */}
			<motion.polyline
				className={styles.end}
				points={dot}
				initial={false}
				animate={{ opacity: landed ? 1 : 0, strokeWidth: landed ? 4 : 0 }}
				transition={
					reduceMotion ? { duration: 0 } : { opacity: quick, strokeWidth: motionTokens.spring.snappy }
				}
			/>
		</svg>
	)
}

export default Sparkline
