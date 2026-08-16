#!/usr/bin/env node
import { detectClaudeCreds } from './claude-creds.js'
import { reportLimitsOnce, runOnce } from './collector.js'
import { commands, completionScript, installCompletions, removeCompletions, shells } from './completion.js'
import type { Shell } from './completion.js'
import { loadConfig } from './config.js'
import { runGuard } from './guard.js'
import { loadNotifyConfig } from './notifier.js'
import { sendNotification } from './notify.js'
import { detectOs } from './os.js'
import { RELEASE_VERSION } from './release.js'
import { serviceStatus } from './service.js'
import { readStore, storePath } from './store.js'
import {
	ago,
	bar,
	blue,
	dim,
	fail,
	green,
	header,
	hint,
	host,
	line,
	note,
	pct,
	row,
	state as stateLine,
	step,
	tilde,
	warn,
	yellow,
} from './ui.js'
import type { Log } from './ui.js'
import { checkForUpdate } from './update.js'

function flag(name: string): string | undefined {
	const prefix = `--${name}`
	const args = process.argv
	for (let i = 0; i < args.length; i++) {
		const a = args[i]
		if (a === prefix) {
			const next = args[i + 1]
			// don't swallow a following option as this flag's value
			return next !== undefined && !next.startsWith('--') ? next : undefined
		}
		if (a.startsWith(`${prefix}=`)) {
			return a.slice(prefix.length + 1)
		}
	}
	return undefined
}

/** "5h ██░░░░░░░░   2% · weekly ████░░░░░░  13%" — the shared limits line.
 *  Bars are plain characters, so they survive a service log as well as a TTY. */
function limitsSummary(limits: {
	fiveHourPct: number | null
	sevenDayPct: number | null
	modelLimits: { model: string; window: string; pct: number | null }[]
}): string {
	const models = limits.modelLimits.map(m => ` · ${m.model}(${m.window}) ${bar(m.pct, 6)} ${pct(m.pct)}`).join('')
	return `5h ${bar(limits.fiveHourPct)} ${pct(limits.fiveHourPct)} · weekly ${bar(limits.sevenDayPct)} ${pct(limits.sevenDayPct)}${models}`
}

/** Every message the collector, notifier and self-update emit, as a stream
 *  line. The level picks the glyph so a problem never reads like a result. */
const stream: Log = (level, m) => {
	line(level === 'warn' ? yellow('!') : note, m)
}

/** Upload result as one stream line — the shape `run` and `watch` share.
 *  Dropped records are the only part worth a colour: they are lost data. */
function cycleLine(r: { sent: number; accepted: number; duplicates: number; dropped: number; files: number }): void {
	const dropped = r.dropped > 0 ? ` · ${yellow(`${r.dropped} dropped`)}` : ''
	line(
		r.dropped > 0 ? yellow('!') : green('↑'),
		`${r.sent} sent ${dim(`· ${r.accepted} accepted · ${r.duplicates} dup · ${r.files} file${r.files === 1 ? '' : 's'}`)}${dropped}`,
	)
}

async function cmdRun(): Promise<void> {
	const cfg = loadConfig()
	const r = await runOnce(cfg, stream)
	cycleLine(r)
	const limits = await reportLimitsOnce(cfg, stream)
	if (limits) {
		line(note, `${limitsSummary(limits)} ${dim(`· ${limits.source}`)}`)
	}
	if (r.failed) {
		process.exitCode = 1
	}
}

async function cmdLimits(): Promise<void> {
	const cfg = loadConfig()
	const limits = await reportLimitsOnce(cfg, stream)
	if (!limits) {
		process.exitCode = 1
		return
	}
	line(note, `${limitsSummary(limits)} ${dim(`· ${limits.source}`)}`)
}

async function cmdWatch(): Promise<void> {
	const cfg = loadConfig()
	const raw = Number(flag('interval') ?? process.env.USAGEFLEET_INTERVAL ?? 15)
	const interval = Math.max(1, Number.isFinite(raw) && raw > 0 ? raw : 15) * 1000
	// The limits ping hits the real Messages API (1 billable token) — don't run it
	// every usage-scan tick. Report at most once per USAGEFLEET_LIMITS_INTERVAL
	// seconds (default 300), decoupled from the much faster usage poll.
	const rawLimits = Number(process.env.USAGEFLEET_LIMITS_INTERVAL ?? 300)
	const limitsInterval =
		Math.max(interval / 1000, Number.isFinite(rawLimits) && rawLimits > 0 ? rawLimits : 300) * 1000
	let lastLimitsAt = 0
	// Self-update: once at startup, then every USAGEFLEET_UPDATE_INTERVAL seconds
	// (default 6h — a release lands on a device the same day, not the next).
	// USAGEFLEET_UPDATE=0 opts out.
	const rawUpdate = Number(process.env.USAGEFLEET_UPDATE_INTERVAL ?? 6 * 60 * 60)
	const updateInterval = Math.max(60, Number.isFinite(rawUpdate) && rawUpdate > 0 ? rawUpdate : 6 * 60 * 60) * 1000
	let lastUpdateAt = 0
	const watching = [cfg.projectsDir, cfg.desktopDir, ...cfg.piDirs].filter((d): d is string => !!d)
	console.log(header(`watching every ${interval / 1000}s`))
	console.log(hint(`${watching.map(tilde).join(' · ')} → ${host(cfg.endpoint)}`))
	console.log('')
	let stopping = false
	let timer: ReturnType<typeof setTimeout> | null = null
	let running = false
	const tick = async () => {
		if (stopping) {
			return
		}
		running = true
		try {
			const r = await runOnce(cfg, stream)
			// Dropped records are real data loss, so they must show up even in a
			// cycle that uploaded nothing.
			if (r.sent > 0 || r.dropped > 0) {
				cycleLine(r)
			}
			const nowMs = Date.now()
			if (nowMs - lastUpdateAt >= updateInterval) {
				lastUpdateAt = nowMs
				await checkForUpdate((level, m) => line(level === 'ok' ? blue('↻') : yellow('!'), m))
			}
			if (nowMs - lastLimitsAt >= limitsInterval) {
				lastLimitsAt = nowMs
				const limits = await reportLimitsOnce(cfg, stream)
				if (limits) {
					line(note, limitsSummary(limits))
				}
			}
		} catch (error) {
			line(yellow('!'), `cycle error ${dim((error as Error).message)}`)
		} finally {
			running = false
		}
		if (!stopping) {
			timer = setTimeout(tick, interval)
		}
	}
	function shutdown() {
		stopping = true
		if (timer) {
			clearTimeout(timer)
		}
		line(note, dim('stopping…'))
		// Let an in-flight cycle finish committing offsets; hard-exit fallback.
		const bail = setTimeout(() => process.exit(0), 5000)
		bail.unref()
		const wait = setInterval(() => {
			if (!running) {
				clearInterval(wait)
				process.exit(0)
			}
		}, 100)
		wait.unref()
	}
	process.on('SIGINT', shutdown)
	process.on('SIGTERM', shutdown)
	await tick()
}

function cmdNotifyTest(): void {
	const cfg = loadNotifyConfig()
	if (!cfg.enabled) {
		console.log(warn('notify', 'disabled · unset USAGEFLEET_NOTIFY=0 to enable'))
		return
	}
	sendNotification('usagefleet', 'Test notification — desktop alerts are working.', {
		urgency: 'normal',
	})
	console.log(step('notified', `${detectOs()} · thresholds ${cfg.thresholds.join(', ')}%`))
}

async function cmdStatus(): Promise<void> {
	const cfg = loadConfig()
	const { limits, state } = readStore(cfg.storePath)
	const tracked = Object.keys(state.files).length
	const mb = (Object.values(state.files).reduce((a, f) => a + f.offset, 0) / 1_048_576).toFixed(1)
	const svc = serviceStatus()
	const creds = await detectClaudeCreds()

	console.log(header())
	console.log('')

	console.log(
		svc.state === 'running'
			? stateLine('ok', 'service', `running${svc.pid ? dim(` · pid ${svc.pid}`) : ''}`)
			: stateLine(
					'bad',
					'service',
					`${svc.state} ${dim(svc.state === 'stopped' ? '· check the log' : '· run `usagefleet install`')}`,
				),
	)
	console.log(
		creds
			? stateLine(
					'ok',
					'claude',
					`${creds.source}${dim(creds.subscriptionType ? ` · ${creds.subscriptionType}` : '')}`,
				)
			: stateLine('warn', 'claude', `no login ${dim('· sign in with `claude` or set ANTHROPIC_API_KEY')}`),
	)
	console.log(
		limits
			? stateLine(
					limitHealth(limits.fiveHourPct, limits.sevenDayPct),
					'limits',
					`5h ${bar(limits.fiveHourPct)} ${pct(limits.fiveHourPct)} · weekly ${bar(limits.sevenDayPct)} ${pct(limits.sevenDayPct)} ${dim(ago(limits.at))}`,
				)
			: stateLine('warn', 'limits', `no reading yet ${dim('· run `usagefleet limits`')}`),
	)

	console.log('')
	console.log(row('endpoint', host(cfg.endpoint)))
	console.log(row('device', `${state.deviceId} · token ${cfg.token.slice(0, 8)}…`))
	const watching = [cfg.projectsDir, cfg.desktopDir, ...cfg.piDirs].filter((d): d is string => !!d)
	for (const [i, dir] of watching.entries()) {
		console.log(row(i === 0 ? 'watching' : '', tilde(dir)))
	}
	console.log(
		row('tracked', `${tracked} file${tracked === 1 ? '' : 's'} · ${mb} MB read · synced ${ago(state.updatedAt)}`),
	)
	console.log(row('config', tilde(cfg.storePath)))
}

/** Worst of the two windows decides the dot colour. */
function limitHealth(fiveHour: number | null, sevenDay: number | null): 'ok' | 'warn' | 'bad' {
	const worst = Math.max(fiveHour ?? 0, sevenDay ?? 0)
	return worst >= 95 ? 'bad' : worst >= 80 ? 'warn' : 'ok'
}

/** Setup in one command: persist the flags (when given), then install the
 *  background service, which refuses to install without a resolvable token.
 *  The write merges over the existing store, so re-running install rotates the
 *  token without resetting tail offsets. Endpoint only matters when
 *  self-hosting; unset keeps whatever is configured. */
async function cmdInstall(): Promise<void> {
	// Apply the flags to the env loadConfig() reads rather than writing them to the
	// store, so there is exactly one precedence chain and install() persists its
	// single winner. Writing to the store first inverted the precedence: loadConfig
	// prefers the env, so a stale USAGEFLEET_TOKEN in the install shell beat the
	// flag and got written back over it, silently voiding token rotation. It also
	// means a rejected value never reaches disk.
	const endpoint = flag('endpoint')
	const token = flag('token')
	if (endpoint) {
		process.env.USAGEFLEET_ENDPOINT = endpoint
	}
	if (token) {
		process.env.USAGEFLEET_TOKEN = token
	}
	const { install } = await import('./service.js')
	install()

	// After the service, so a completion problem can never fail the part that
	// matters. Self-update re-runs `install`, which keeps completions in step with
	// new commands without the user doing anything.
	try {
		for (const { shell, path, rc } of installCompletions()) {
			console.log(step(`${shell} completions`, tilde(path)))
			if (rc) {
				console.log(row('shell', `${tilde(rc)} updated · restart the shell to pick it up`))
			}
		}
	} catch (error) {
		console.log(warn('completions', (error as Error).message))
	}
}

/** Padded two-column list — name in white, meaning in gray, like the result
 *  lines. Shared by `help` and `config`. */
function print(rows: [string, string][]): void {
	const width = Math.max(...rows.map(([name]) => name.length))
	for (const [name, meaning] of rows) {
		console.log(`  ${name.padEnd(width)}  ${dim(meaning)}`)
	}
}

/** Where settings live and every env var that overrides them. Reads nothing:
 *  it must work before a token exists, when the config is what you're fixing. */
function cmdConfig(): void {
	const env: [string, string][] = [
		['USAGEFLEET_ENDPOINT', 'server base URL (self-hosting only)'],
		['USAGEFLEET_TOKEN', 'device token from the Devices page'],
		['USAGEFLEET_PROJECTS', 'override ~/.claude/projects'],
		['USAGEFLEET_DESKTOP', 'override the Claude Desktop dir ("off" disables)'],
		['USAGEFLEET_PI', 'override pi session dirs, comma-separated'],
		['USAGEFLEET_INTERVAL', 'watch interval seconds (default 15)'],
		['USAGEFLEET_LIMITS_INTERVAL', 'seconds between limits pings (default 300)'],
		['USAGEFLEET_BATCH', 'records per upload (default 100, max 1000)'],
		['USAGEFLEET_NOTIFY', 'desktop notifications (0 disables)'],
		['USAGEFLEET_NOTIFY_THRESHOLDS', 'comma list of % alerts (default 80,95)'],
		['USAGEFLEET_HOOK', 'register the guard on install (0 skips)'],
		['USAGEFLEET_UPDATE', 'self-update while watching (0 disables)'],
		['USAGEFLEET_UPDATE_INTERVAL', 'seconds between update checks (default 21600)'],
		['USAGEFLEET_CONFIG', 'relocate the config file'],
	]
	console.log(header())
	console.log(hint('settings, tail offsets and notification marks'))
	console.log('')
	console.log(row('file', tilde(storePath())))
	console.log('')
	console.log(hint('env — overrides the file'))
	print(env)
	console.log('')
	console.log(hint('`usagefleet status` shows the resolved values'))
}

/** Print a completion script, or the shells we know how to write one for. */
function cmdCompletion(): void {
	const shell = process.argv[3]
	if (!shells.includes(shell as Shell)) {
		console.error(fail('completion', `expected one of ${shells.join(', ')}`))
		process.exitCode = 1
		return
	}
	console.log(completionScript(shell as Shell))
}

/** Command list, in the same padded-column style as the result lines. */
function help(): void {
	console.log(header())
	console.log('')
	print(commands.map(c => [c.args ? `${c.name} ${c.args}` : c.name, c.meaning]))
	console.log('')
	console.log(hint('`usagefleet config` lists the config file and its env overrides'))
}

async function main(): Promise<void> {
	// Log-and-continue for the long-running watch daemon: a stray rejection must
	// not silently kill the background service. One-shot commands still set a
	// non-zero exit via their own error paths.
	process.on('unhandledRejection', reason => {
		line(yellow('!'), `unhandled rejection ${dim(String(reason))}`)
	})
	process.on('uncaughtException', err => {
		line(yellow('!'), `uncaught exception ${dim((err as Error).message)}`)
	})

	const cmd = process.argv[2] ?? 'help'
	switch (cmd) {
		case 'run': {
			return cmdRun()
		}
		case 'watch': {
			return cmdWatch()
		}
		case 'limits': {
			return cmdLimits()
		}
		case 'guard': {
			process.exitCode = await runGuard()
			return
		}
		case 'update': {
			console.log(header())
			console.log('')
			await checkForUpdate(
				(level, m) => console.log(level === 'ok' ? step('update', m) : warn('update', m)),
				true,
			)
			return
		}
		case 'notify-test': {
			return cmdNotifyTest()
		}
		case 'status': {
			return cmdStatus()
		}
		case 'config': {
			return cmdConfig()
		}
		case 'completion': {
			return cmdCompletion()
		}
		// Flags only: bare `usagefleet` already prints the version in its header.
		case '--version':
		case '-v': {
			console.log(RELEASE_VERSION)
			return
		}
		// `init` was the separate config step; it now just does the whole setup.
		case 'init':
		case 'install': {
			return cmdInstall()
		}
		case 'uninstall': {
			const { uninstall } = await import('./service.js')
			uninstall()
			removeCompletions()
			return
		}
		default: {
			return help()
		}
	}
}

main().catch(error => {
	console.error(fail('error', (error as Error).message))
	process.exit(1)
})
