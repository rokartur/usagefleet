/**
 * The CLI's only output surface, "quiet" style: lowercase labels, one accent
 * colour, detail in gray, a padded label column so lines align. Every command
 * — install, status, watch, the collector's own stream — prints through these
 * helpers, so a TTY and a service log read the same.
 *
 * Colour is dropped when stdout is not a TTY (service logs, CI, pipes) or when
 * NO_COLOR is set. Glyphs and bars are plain characters, so a log file still
 * shows them.
 */

import { homedir } from 'node:os'
import { detectOs } from './os.js'
import { RELEASE_VERSION } from './release.js'

const useColor = process.stdout.isTTY === true && !process.env.NO_COLOR

function paint(code: string): (s: string) => string {
	return s => (useColor ? `\u001B[${code}m${s}\u001B[0m` : s)
}

export const dim = paint('90')
/** One step below `dim`: timestamps, which are structure rather than content. */
export const dimmer = paint('2;90')
export const green = paint('32')
export const yellow = paint('33')
export const red = paint('31')
export const blue = paint('34')

/** Width of the label column shared by every labelled line. */
const LABEL = 12

/** "usagefleet 1.2.55  mac-arm64" — the banner an interactive command opens
 *  with. `detail` replaces the platform when a command has something better to
 *  say about itself (watch states its interval). */
export function header(detail = `${detectOs()}-${process.arch}`): string {
	const build = RELEASE_VERSION === 'dev' ? ' · local build, self-update off' : ''
	return `${blue('usagefleet')} ${dim(`${RELEASE_VERSION}${build}  ${detail}`)}`
}

/** Server without its scheme: the host is the part worth reading. */
export function host(endpoint: string): string {
	return endpoint.replace(/^https?:\/\//, '').replace(/\/$/, '')
}

/** "✓ installed    ~/.local/bin/usagefleet" — a completed step. */
export function step(label: string, detail = ''): string {
	return `${green('✓')} ${label.padEnd(LABEL)} ${dim(detail)}`
}

/** "✗ verify failed  expected 4f8c…" — a step that did not happen. */
export function fail(label: string, detail = ''): string {
	return `${red('✗')} ${label.padEnd(LABEL)} ${dim(detail)}`
}

/** "! service      systemctl unavailable" — worked, but not fully. */
export function warn(label: string, detail = ''): string {
	return `${yellow('!')} ${label.padEnd(LABEL)} ${dim(detail)}`
}

/** "● service      running" — state with a health-coloured dot. */
export function state(health: 'ok' | 'warn' | 'bad', label: string, detail: string): string {
	const dot = health === 'ok' ? green('●') : health === 'warn' ? yellow('●') : red('●')
	return `${dot} ${label.padEnd(LABEL)} ${detail}`
}

/** "  config       ~/.config/usagefleet/config.json" — a plain detail line. */
export function row(label: string, detail: string): string {
	return `  ${label.padEnd(LABEL)} ${dim(detail)}`
}

/** A closing suggestion, or any line that is context rather than result. */
export function hint(text: string): string {
	return dim(text)
}

/** Home-relative path, because `~/.claude/projects` reads and wraps better than
 *  the absolute one — and hides the user's account name in a pasted terminal. */
export function tilde(path: string): string {
	const home = homedir()
	return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

/** Day of the last printed stream line. The date is stated on rollover only:
 *  HH:MM:SS alone is unreadable in a service log that spans a week, while a
 *  one-shot command is already dated by the shell that ran it. */
let lastDay = ''

/**
 * One line of the live stream: "09:14:02 ↑ 12 sent · 12 accepted".
 * Used by `watch`, `run` and every message the collector emits, so the service
 * log is the same stream a foreground run shows.
 */
export function line(glyph: string, text: string): void {
	const now = new Date()
	const day = now.toLocaleDateString('en-CA')
	if (lastDay && day !== lastDay) {
		console.log(dimmer(`── ${day}`))
	}
	lastDay = day
	console.log(`${dimmer(now.toTimeString().slice(0, 8))} ${glyph} ${text}`)
}

/** Neutral stream glyph, for messages that are neither good nor bad news. */
export const note = dim('·')

/** Progress reporter handed to the long-running paths (collect, limits, notify,
 *  self-update). The level picks the glyph, so a failure never renders like a
 *  result — and a caller that only wants the text can ignore it. */
export type Log = (level: 'ok' | 'warn', msg: string) => void

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
