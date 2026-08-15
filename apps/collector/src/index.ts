#!/usr/bin/env node
import { detectClaudeCreds } from './claude-creds.js'
import { reportLimitsOnce, runOnce } from './collector.js'
import { loadConfig } from './config.js'
import { runGuard } from './guard.js'
import { loadNotifyConfig } from './notifier.js'
import { sendNotification } from './notify.js'
import { detectOs } from './os.js'
import { RELEASE_VERSION } from './release.js'
import { readStore, storePath, updateStore } from './store.js'
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

function ts(): string {
	return new Date().toISOString().replace('T', ' ').slice(0, 19)
}

/** "5h 2% · weekly 13% · fable(7d) 24%" — the shared limits log line. */
function limitsSummary(limits: {
	fiveHourPct: number | null
	sevenDayPct: number | null
	modelLimits: { model: string; window: string; pct: number | null }[]
}): string {
	const models = limits.modelLimits.map(m => ` · ${m.model}(${m.window}) ${m.pct ?? '?'}%`).join('')
	return `5h ${limits.fiveHourPct ?? '?'}% · weekly ${limits.sevenDayPct ?? '?'}%${models}`
}

async function cmdRun(): Promise<void> {
	const cfg = loadConfig()
	const r = await runOnce(cfg, m => console.log(`[${ts()}] ${m}`))
	console.log(
		`[${ts()}] scanned ${r.files} files · sent ${r.sent} · accepted ${r.accepted} · duplicates ${r.duplicates}${r.dropped > 0 ? ` · DROPPED ${r.dropped}` : ''}${r.failed ? ' · FAILED' : ''}`,
	)
	const limits = await reportLimitsOnce(cfg, m => console.log(`[${ts()}] ${m}`))
	if (limits) {
		console.log(`[${ts()}] limits (${limits.source}): ${limitsSummary(limits)}`)
	}
	if (r.failed) {
		process.exitCode = 1
	}
}

async function cmdLimits(): Promise<void> {
	const cfg = loadConfig()
	const limits = await reportLimitsOnce(cfg, m => console.log(`[${ts()}] ${m}`))
	if (!limits) {
		process.exitCode = 1
		return
	}
	console.log(`[${ts()}] reported ${limits.source}: ${limitsSummary(limits)}`)
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
	console.log(
		`[${ts()}] usagefleet watching ${cfg.projectsDir}${cfg.desktopDir ? ` + ${cfg.desktopDir}` : ''}${cfg.piDirs.map(d => ` + ${d}`).join('')} every ${interval / 1000}s → ${cfg.endpoint}`,
	)
	let stopping = false
	let timer: ReturnType<typeof setTimeout> | null = null
	let running = false
	const tick = async () => {
		if (stopping) {
			return
		}
		running = true
		try {
			const r = await runOnce(cfg, m => console.log(`[${ts()}] ${m}`))
			// Dropped records are real data loss, so they must show up even in a
			// cycle that uploaded nothing.
			if (r.sent > 0 || r.dropped > 0) {
				console.log(
					`[${ts()}] sent ${r.sent} · accepted ${r.accepted} · dup ${r.duplicates}${r.dropped > 0 ? ` · DROPPED ${r.dropped}` : ''}`,
				)
			}
			const nowMs = Date.now()
			if (nowMs - lastUpdateAt >= updateInterval) {
				lastUpdateAt = nowMs
				await checkForUpdate(cfg, m => console.log(`[${ts()}] ${m}`))
			}
			if (nowMs - lastLimitsAt >= limitsInterval) {
				lastLimitsAt = nowMs
				const limits = await reportLimitsOnce(cfg, m => console.log(`[${ts()}] ${m}`))
				if (limits) {
					console.log(`[${ts()}] limits (${limits.source}): ${limitsSummary(limits)}`)
				}
			}
		} catch (error) {
			console.error(`[${ts()}] cycle error:`, (error as Error).message)
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
		console.log(`\n[${ts()}] stopping…`)
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
		console.log('Notifications are disabled (USAGEFLEET_NOTIFY=0).')
		return
	}
	sendNotification('usagefleet', 'Test notification — desktop alerts are working.', {
		urgency: 'normal',
	})
	console.log(`[${ts()}] sent a test notification via ${detectOs()} (thresholds: ${cfg.thresholds.join(', ')}%)`)
}

async function cmdStatus(): Promise<void> {
	const cfg = loadConfig()
	const { state } = readStore(cfg.storePath)
	const tracked = Object.keys(state.files).length
	const bytes = Object.values(state.files).reduce((a, f) => a + f.offset, 0)
	console.log(`os:        ${detectOs()}`)
	console.log(
		`release:   ${RELEASE_VERSION}${RELEASE_VERSION === 'dev' ? ' (local build \u2014 self-update disabled)' : ''}`,
	)
	console.log(`config:    ${cfg.storePath}`)
	console.log(`endpoint:  ${cfg.endpoint}`)
	console.log(`token:     ${cfg.token.slice(0, 8)}…`)
	console.log(`projects:  ${cfg.projectsDir}`)
	console.log(`desktop:   ${cfg.desktopDir ?? '(disabled)'}`)
	console.log(`pi:        ${cfg.piDirs.join(', ') || '(disabled)'}`)
	console.log(`deviceId:  ${state.deviceId}`)
	console.log(`tracked:   ${tracked} files, ${bytes} bytes consumed`)
	console.log(`updated:   ${state.updatedAt}`)
	const creds = await detectClaudeCreds()
	console.log(
		`claude:    ${creds ? `${creds.source}${creds.subscriptionType ? ` (${creds.subscriptionType})` : ''} detected` : 'no login detected'}`,
	)
}

function cmdInit(): void {
	const endpoint = flag('endpoint') ?? process.env.USAGEFLEET_ENDPOINT
	const token = flag('token') ?? process.env.USAGEFLEET_TOKEN
	if (!endpoint || !token) {
		console.error('Usage: usagefleet init --endpoint <url> --token <device-token>')
		process.exit(1)
	}
	const path = storePath()
	// Merges over whatever is already there, so tail offsets and projectsDir
	// survive a re-init and the device does not re-upload its whole history.
	updateStore(path, store => {
		store.endpoint = endpoint
		store.token = token
	})
	console.log(`Wrote ${path}`)
}

function help(): void {
	console.log(`usagefleet ${RELEASE_VERSION} — Claude usage collector

Usage:
  usagefleet run                 Scan once, upload usage + report limits
  usagefleet watch [--interval s] Poll continuously (default 15s)
  usagefleet limits              Report only your real 5h/weekly limit usage
  usagefleet guard               Exit 2 if this device's group is over a blocking limit
                                   (use as a Claude Code UserPromptSubmit hook)
  usagefleet update              Update to the latest release now (watch does this every 6h)
  usagefleet notify-test         Fire a test desktop notification
  usagefleet status              Show resolved config + state + Claude login
  usagefleet init --endpoint <url> --token <t>   Write ~/.config/usagefleet/config.json
  usagefleet install             Install as a background service (launchd/systemd/Task Scheduler)
                                   and register the guard as a Claude Code hook
  usagefleet uninstall           Remove the background service and the hook

Config (env overrides ~/.config/usagefleet/config.json, which holds settings,
tail offsets and notification marks; USAGEFLEET_CONFIG relocates it):
  USAGEFLEET_ENDPOINT   server base URL (e.g. https://track.example.com)
  USAGEFLEET_TOKEN      device token from the Devices page
  USAGEFLEET_PROJECTS   override ~/.claude/projects (Claude Code)
  USAGEFLEET_DESKTOP    override Claude Desktop sessions dir ("off" to disable)
  USAGEFLEET_PI         override pi sessions dirs, comma-separated ("off" to disable)
  USAGEFLEET_INTERVAL   watch interval seconds
  USAGEFLEET_NOTIFY     desktop notifications on/off (default on; 0 to disable)
  USAGEFLEET_HOOK       register the guard in ~/.claude/settings.json on install (0 to skip)
  USAGEFLEET_UPDATE     self-update while watching (0 to disable)
  USAGEFLEET_UPDATE_INTERVAL  seconds between update checks (default 21600 = 6h)
  USAGEFLEET_NOTIFY_THRESHOLDS  comma list of % alerts (default 80,95)`)
}

async function main(): Promise<void> {
	// Log-and-continue for the long-running watch daemon: a stray rejection must
	// not silently kill the background service. One-shot commands still set a
	// non-zero exit via their own error paths.
	process.on('unhandledRejection', reason => {
		console.error(`[${ts()}] unhandledRejection:`, reason)
	})
	process.on('uncaughtException', err => {
		console.error(`[${ts()}] uncaughtException:`, (err as Error).message)
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
			await checkForUpdate(loadConfig(), m => console.log(`[${ts()}] ${m}`), true)
			return
		}
		case 'notify-test': {
			return cmdNotifyTest()
		}
		case 'status': {
			return cmdStatus()
		}
		case 'init': {
			return cmdInit()
		}
		case 'install': {
			const { install } = await import('./service.js')
			return install()
		}
		case 'uninstall': {
			const { uninstall } = await import('./service.js')
			return uninstall()
		}
		default: {
			return help()
		}
	}
}

main().catch(error => {
	console.error((error as Error).message)
	process.exit(1)
})
