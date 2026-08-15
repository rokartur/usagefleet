/**
 * Terminal output helpers, "quiet" style: one accent colour, detail in gray,
 * a padded label column so lines align.
 *
 * Colour is dropped when stdout is not a TTY (service logs, CI, pipes) or when
 * NO_COLOR is set. Bars are plain characters, so a log file still shows them.
 */

const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR

function paint(code: string): (s: string) => string {
	return s => (useColor ? `\u001B[${code}m${s}\u001B[0m` : s)
}

export const dim = paint('90')
export const green = paint('32')
export const yellow = paint('33')
export const red = paint('31')
export const blue = paint('34')
export const bold = paint('1')

/** Width of the label column shared by `step` and `row`. */
const LABEL = 10

/** "✓ installed   ~/.local/bin/usagefleet" — a completed step. */
export function step(label: string, detail = ''): string {
	return `${green('✓')} ${label.padEnd(LABEL)} ${dim(detail)}`
}

/** "● service     running" — state with a health-coloured dot. */
export function state(health: 'ok' | 'warn' | 'bad', label: string, detail: string): string {
	const dot = health === 'ok' ? green('●') : health === 'warn' ? yellow('●') : red('●')
	return `${dot} ${label.padEnd(LABEL)} ${detail}`
}

/** "  config      ~/.config/usagefleet/config.json" — a plain detail line. */
export function row(label: string, detail: string): string {
	return `  ${label.padEnd(LABEL)} ${dim(detail)}`
}

/** Percentage as a fixed-width string, so successive log lines line up. */
export function pct(value: number | null): string {
	return `${value ?? '?'}%`.padStart(4)
}

/** Usage bar, coloured by how close the window is to its limit.
 *  Unknown usage renders as an empty bar rather than a missing column. */
export function bar(value: number | null, width = 10): string {
	if (value === null) {
		return dim('░'.repeat(width))
	}
	// Any real usage lights at least one cell: an empty bar means zero, nothing else.
	const cells = Math.round((value / 100) * width)
	const filled = value > 0 ? Math.max(1, Math.min(width, cells)) : 0
	const fill = value >= 95 ? red : value >= 80 ? yellow : green
	return fill('█'.repeat(filled)) + dim('░'.repeat(width - filled))
}

/** "2m ago" / "3d ago" — compact age of an ISO timestamp. */
export function ago(iso: string | undefined): string {
	if (!iso) {
		return 'never'
	}
	const ms = Date.now() - new Date(iso).getTime()
	if (!Number.isFinite(ms) || ms < 0) {
		return 'unknown'
	}
	const s = Math.round(ms / 1000)
	if (s < 60) {
		return `${s}s ago`
	}
	if (s < 3600) {
		return `${Math.round(s / 60)}m ago`
	}
	if (s < 86_400) {
		return `${Math.round(s / 3600)}h ago`
	}
	return `${Math.round(s / 86_400)}d ago`
}
