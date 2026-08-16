import { useEffect, useRef } from 'react'
import { useInView, useReducedMotion, useScroll, useSpring, useVelocity } from 'motion/react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

/** The landing's 3D mark: one core, three tilted orbits, six devices riding
 *  them — the product in one object. Canvas rather than SVG because every frame
 *  is a fresh projection, and hand-rolled rather than three.js because a
 *  wireframe of 170 segments needs a matrix multiply, not a renderer.
 *
 *  Colour is read from the canvas' own CSS `color`, so the mark follows the
 *  theme with no prop and no palette of its own. */

const SEGMENTS = 56
const RADIUS = 0.92
/** Camera distance in object units; smaller exaggerates the perspective. */
const PERSPECTIVE = 3.6
const IDLE_SPIN = 0.22
/** Radians per second added per pixel/second of scroll, clamped below. */
const SCROLL_SPIN = 0.0004
const MAX_SCROLL_SPIN = 3
const TAU = Math.PI * 2

type Point = readonly [number, number, number]

/** One ring of unit radius, tilted out of the XY plane twice so no two rings
 *  share a plane. Points are static: a device is an index into this array. */
function ring(tiltX: number, tiltZ: number): Point[] {
	return Array.from({ length: SEGMENTS }, (_, s) => {
		const a = (s / SEGMENTS) * TAU
		const x = Math.cos(a)
		const y = Math.sin(a) * Math.cos(tiltX)
		const z = Math.sin(a) * Math.sin(tiltX)
		return [
			(x * Math.cos(tiltZ) - y * Math.sin(tiltZ)) * RADIUS,
			(x * Math.sin(tiltZ) + y * Math.cos(tiltZ)) * RADIUS,
			z * RADIUS,
		] as const
	})
}

const RINGS = [0, 1, 2].map(k => ring((k * Math.PI) / 3.1, (k * Math.PI) / 5.2))

/** Two devices per ring, six in total, each with its own speed and phase so
 *  they never line up into a pattern. */
const DEVICES = RINGS.flatMap((_, k) =>
	[0, 1].map(d => ({ ring: k, speed: 0.1 + k * 0.035, phase: d * 0.5 + k * 0.17 })),
)

/** Depth cue, and the only one: on a black or a white page the mark is a single
 *  colour, so distance has to read as opacity and line weight. */
const shade = (z: number) => Math.max(0.06, Math.min(1, (z + 1.15) / 2.3))

interface Frame {
	ctx: CanvasRenderingContext2D
	/** CSS pixels; the canvas is square. */
	size: number
	dpr: number
	color: string
	spin: number
	tilt: number
	seconds: number
	/** 0 to 1: the object flies in from a wider orbit as this fills. */
	appear: number
}

function drawFrame({ ctx, size, dpr, color, spin, tilt, seconds, appear }: Frame) {
	const ease = appear >= 1 ? 1 : 1 - 2 ** (-10 * appear)
	const spread = 1 + (1 - ease) * 1.15
	const centre = size / 2
	const scale = size * 0.4
	const sinY = Math.sin(spin)
	const cosY = Math.cos(spin)
	const sinX = Math.sin(tilt)
	const cosX = Math.cos(tilt)

	const project = ([px, py, pz]: Point) => {
		const x = px * spread
		const y = py * spread
		const z = pz * spread
		const xr = x * cosY + z * sinY
		const zy = z * cosY - x * sinY
		const yr = y * cosX - zy * sinX
		const zd = y * sinX + zy * cosX
		const k = PERSPECTIVE / (PERSPECTIVE - zd)
		return { x: centre + xr * scale * k, y: centre + yr * scale * k, z: zd }
	}

	ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	ctx.clearRect(0, 0, size, size)
	ctx.strokeStyle = color
	ctx.fillStyle = color

	const rings = RINGS.map(points => points.map(project))

	// Painter's order across all three rings at once, so the far arc of one ring
	// is drawn under the near arc of another instead of per-ring stacking.
	const segments = rings.flatMap(points =>
		points.map((from, i) => {
			const to = points[(i + 1) % points.length]
			return { from, to, depth: (from.z + to.z) / 2 }
		}),
	)
	segments.sort((a, b) => a.depth - b.depth)

	for (const { from, to, depth } of segments) {
		const d = shade(depth)
		ctx.globalAlpha = (0.08 + d * 0.5) * ease
		ctx.lineWidth = 0.5 + d * 0.9
		ctx.beginPath()
		ctx.moveTo(from.x, from.y)
		ctx.lineTo(to.x, to.y)
		ctx.stroke()
	}

	const core = project([0, 0, 0])
	const devices = DEVICES.map(device => {
		const step = Math.floor((((seconds * device.speed + device.phase) % 1) * SEGMENTS) % SEGMENTS)
		return rings[device.ring][step]
	})

	// Spoke to the core: every device counts against one account.
	for (const device of devices) {
		ctx.globalAlpha = 0.22 * shade(device.z) * ease
		ctx.lineWidth = 0.6
		ctx.beginPath()
		ctx.moveTo(core.x, core.y)
		ctx.lineTo(device.x, device.y)
		ctx.stroke()
	}

	for (const device of devices) {
		const d = shade(device.z)
		ctx.globalAlpha = (0.25 + d * 0.75) * ease
		ctx.beginPath()
		ctx.arc(device.x, device.y, size * 0.007 * (0.55 + d * 0.7), 0, TAU)
		ctx.fill()
	}

	ctx.globalAlpha = ease
	ctx.beginPath()
	ctx.arc(core.x, core.y, size * 0.014, 0, TAU)
	ctx.fill()
	ctx.globalAlpha = 1
}

/** Draws only while on screen and only with the tab in front: this is the one
 *  continuously repainting thing on the page. Reduced motion gets a single
 *  static frame instead of the loop. */
export function OrbitMark({ className }: { className?: string }) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const inView = useInView(canvasRef, { amount: 0.05 })
	const reducedMotion = useReducedMotion()
	// Theme is not read, only depended on: a change re-runs the effect, which
	// re-reads the colour and repaints even when the loop is not running.
	const { resolvedTheme } = useTheme()
	const { scrollY } = useScroll()
	const scrollVelocity = useVelocity(scrollY)
	// Springs so the mark lags the cursor instead of snapping to it.
	const pointerTilt = useSpring(0, { stiffness: 90, damping: 18 })
	const pointerSpin = useSpring(0, { stiffness: 90, damping: 18 })
	const state = useRef({ spin: 0.6, tilt: -0.35, appear: 0, drag: null as { x: number; y: number } | null })

	useEffect(() => {
		const canvas = canvasRef.current
		const ctx = canvas?.getContext('2d')
		if (!canvas || !ctx) {
			return
		}

		const dpr = Math.min(window.devicePixelRatio || 1, 2)
		const color = getComputedStyle(canvas).color
		let size = canvas.clientWidth
		const resize = () => {
			size = canvas.clientWidth
			canvas.width = Math.max(1, Math.round(size * dpr))
			canvas.height = canvas.width
		}

		const paint = (seconds: number) =>
			drawFrame({
				ctx,
				size,
				dpr,
				color,
				seconds,
				spin: state.current.spin + pointerSpin.get(),
				tilt: state.current.tilt + pointerTilt.get(),
				appear: state.current.appear,
			})

		resize()
		const observer = new ResizeObserver(() => {
			resize()
			// The loop redraws by itself; a static frame has to be told to.
			if (reducedMotion) {
				paint(0)
			}
		})
		observer.observe(canvas)

		if (reducedMotion) {
			state.current.appear = 1
			paint(0)
			return () => observer.disconnect()
		}

		if (!inView) {
			return () => observer.disconnect()
		}

		let raf = 0
		let last = performance.now()
		const frame = (now: number) => {
			raf = requestAnimationFrame(frame)
			const dt = Math.min((now - last) / 1000, 0.05)
			last = now
			if (document.hidden) {
				return
			}
			const kick = Math.max(-MAX_SCROLL_SPIN, Math.min(MAX_SCROLL_SPIN, scrollVelocity.get() * SCROLL_SPIN))
			state.current.appear = Math.min(1, state.current.appear + dt / 1.1)
			state.current.spin += dt * (IDLE_SPIN + kick)
			paint(now / 1000)
		}
		raf = requestAnimationFrame(frame)

		return () => {
			cancelAnimationFrame(raf)
			observer.disconnect()
		}
	}, [inView, reducedMotion, resolvedTheme, pointerSpin, pointerTilt, scrollVelocity])

	const endDrag = () => {
		state.current.drag = null
	}

	return (
		<canvas
			ref={canvasRef}
			aria-hidden
			className={cn(
				'aspect-square w-full touch-none text-foreground',
				!reducedMotion && 'cursor-grab',
				className,
			)}
			onPointerDown={event => {
				state.current.drag = { x: event.clientX, y: event.clientY }
				event.currentTarget.setPointerCapture(event.pointerId)
			}}
			onPointerMove={event => {
				const drag = state.current.drag
				if (drag) {
					state.current.spin += (event.clientX - drag.x) * 0.011
					state.current.tilt = Math.max(
						-1.2,
						Math.min(1.2, state.current.tilt + (event.clientY - drag.y) * 0.011),
					)
					state.current.drag = { x: event.clientX, y: event.clientY }
					return
				}
				const box = event.currentTarget.getBoundingClientRect()
				pointerSpin.set(((event.clientX - box.left) / box.width - 0.5) * 0.7)
				pointerTilt.set(((event.clientY - box.top) / box.height - 0.5) * -0.5)
			}}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onPointerLeave={() => {
				endDrag()
				pointerSpin.set(0)
				pointerTilt.set(0)
			}}
		/>
	)
}
