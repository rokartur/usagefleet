import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { ENDPOINT, loadConfig } from './config.js'
import { installPromptHook, uninstallPromptHook } from './hook.js'
import { readStore, storePath, updateStore } from './store.js'
import type { Config } from './types.js'
import { fail, header, hint, host, row, step, tilde, warn } from './ui.js'

const LABEL = 'dev.usagefleet.collector'
/** Scheduled Task name on Windows (mirrors the launchd label / systemd unit). */
const TASK = 'usagefleet'

/** Extra env the service needs that does not carry the USAGEFLEET_ prefix.
 *  CLAUDE_CONFIG_DIR picks which Claude login this collector watches, so a
 *  service that lost it would silently report the default account instead. */
const EXTRA_PASSTHROUGH_ENV = new Set(['ANTHROPIC_API_KEY', 'CLAUDE_CONFIG_DIR'])

/** Per-user dir for the collector's own runtime files: the Windows launcher and
 *  its log, plus the binary copy that pre-npm releases left there. */
function stableBinDir(): string {
	if (process.platform === 'darwin') {
		return join(homedir(), 'Library', 'Application Support', 'usagefleet')
	}
	if (process.platform === 'win32') {
		return join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'usagefleet')
	}
	return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'usagefleet')
}

/** Where the Windows launcher sends the collector's stdout/stderr (systemd has
 *  the journal — a hidden task has nowhere else to go). */
function windowsLogPath(): string {
	return join(stableBinDir(), 'usagefleet.log')
}

/** launchd log dir. Not /tmp: that is world-writable, so any other local account
 *  could pre-create the log path as a symlink and have the agent write through
 *  it as this user. ~/Library/Logs is the platform's answer and is user-owned. */
function macLogDir(): string {
	return join(homedir(), 'Library', 'Logs', 'usagefleet')
}

function windowsVbsPath(): string {
	return join(stableBinDir(), 'usagefleet-watch.vbs')
}

/** Where releases before the npm switch parked their copy of the binary. Only
 *  cleanup touches it now. */
function stableBinPath(): string {
	return join(stableBinDir(), process.platform === 'win32' ? 'usagefleet.exe' : 'usagefleet')
}

/** True when running as a compiled single-file executable rather than
 *  `node dist/index.js`. A bun `--compile` binary has no real re-invokable
 *  script at argv[1]: it's absent, equals the exec path, or points into bun's
 *  virtual bundle filesystem (`/$bunfs/…` on POSIX, `…~BUN\…` on Windows).
 *  Treating that virtual path as a real script (the old bug) baked a bogus
 *  argument into the service command, so the launched process saw an unknown
 *  command, printed help, and exited cleanly — leaving the service down. */
export function looksLikeCompiledBinary(scriptPath: string | undefined, execPath: string): boolean {
	if (!scriptPath || scriptPath === execPath) {
		return true
	}
	if (scriptPath.includes('/$bunfs/')) {
		return true
	}
	if (/[\\/]~BUN[\\/]/.test(scriptPath)) {
		return true
	}
	return false
}

/** The `usagefleet` a shell would run, when that is NOT this install — e.g. the
 *  standalone binary a pre-npm release left in /usr/local/bin, which sits ahead
 *  of the npm prefix on most PATHs and would keep answering after an upgrade.
 *  Only the first hit matters: that is the one the shell picks. */
export function shadowingBinary(pathEnv: string | undefined, self: string): string | null {
	const name = process.platform === 'win32' ? 'usagefleet.exe' : 'usagefleet'
	const real = (p: string): string => {
		try {
			return realpathSync(p)
		} catch {
			return p
		}
	}
	for (const dir of (pathEnv || '').split(delimiter).filter(Boolean)) {
		const candidate = join(dir, name)
		if (existsSync(candidate)) {
			return real(candidate) === real(self) ? null : candidate
		}
	}
	return null
}

/** Program + leading args to launch `watch`. npm installs a script, so this is
 *  normally an absolute node plus the global package path — both survive PATH
 *  being nearly empty, which is what launchd and systemd hand the service. */
function programArgs(): string[] {
	const script = process.argv[1]
	if (looksLikeCompiledBinary(script, process.execPath)) {
		// Only a locally built `bun --compile` binary reaches this now: it has no
		// re-invokable script, so the service launches the executable itself.
		return [process.execPath, 'watch']
	}
	return [process.execPath, script as string, 'watch']
}

function macPlistPath(): string {
	return join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`)
}

function systemdUnitPath(): string {
	return join(homedir(), '.config', 'systemd', 'user', 'usagefleet.service')
}

/** Env vars that are actually set, for baking into the unit so the service
 *  behaves like the install shell. Derived from the USAGEFLEET_ prefix rather
 *  than a hand-kept allowlist: that list had already drifted, silently dropping
 *  USAGEFLEET_PI, USAGEFLEET_DESKTOP and USAGEFLEET_LIMITS_INTERVAL, so a
 *  documented override did nothing once the collector ran as a service. */
function presentEnv(): [string, string][] {
	return Object.entries(process.env).filter(
		(entry): entry is [string, string] =>
			!!entry[1] && (entry[0].startsWith('USAGEFLEET_') || EXTRA_PASSTHROUGH_ENV.has(entry[0])),
	)
}

/** Escape a string for a VBScript double-quoted literal (only `"` is special). */
function vbs(s: string): string {
	return `"${s.replaceAll('"', '""')}"`
}

/** Hidden launcher for the Scheduled Task. A bun-compiled collector is a console
 *  app, so running it straight from Task Scheduler pops a console window that
 *  stays up for the whole session; wscript.exe is windowless and starts the
 *  collector with window style 0. It also carries the USAGEFLEET_* env the way
 *  the plist/unit does (Task XML has no env support) and redirects output to a
 *  log file, since a hidden process has no console to print to.
 *  Waits (`True`) so the task instance lives as long as the collector — that's
 *  what makes RestartOnFailure in the task XML meaningful. */
export function windowsLauncherVbs(prog: string[], env: [string, string][], logPath: string): string {
	const quoted = prog.map(p => `"${p}"`).join(' ')
	// `cmd /c ""prog" args > "log""` is cmd's canonical form for quoted paths.
	const cmdLine = `cmd /c "${quoted} > "${logPath}" 2>&1"`
	const envLines = env
		// A newline would end the VBS statement; such a value can't be represented.
		.filter(([, v]) => !/[\r\n]/.test(v))
		.map(([k, v]) => `env(${vbs(k)}) = ${vbs(v)}`)
	return [
		"' usagefleet background launcher — generated by `usagefleet login`.",
		'Set sh = CreateObject("WScript.Shell")',
		'Set env = sh.Environment("Process")',
		...envLines,
		`sh.Run ${vbs(cmdLine)}, 0, True`,
		'',
	].join('\r\n')
}

/** Scheduled Task definition: run at logon, restart on failure, no time limit —
 *  the Windows equivalent of RunAtLoad+KeepAlive / Restart=always.
 *  <Settings> children follow the order Windows itself exports; the schema is a
 *  strict sequence and rejects the whole file if they're shuffled. */
export function windowsTaskXml(vbsPath: string, userId: string): string {
	return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>UsageFleet collector</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${xml(userId)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xml(userId)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>//B //Nologo "${xml(vbsPath)}"</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

/** Current user as DOMAIN\user (or just user), for the task's principal. */
function windowsUserId(): string {
	const user = process.env.USERNAME || process.env.USER || ''
	const domain = process.env.USERDOMAIN
	return domain ? `${domain}\\${user}` : user
}

function schtasks(...args: string[]): boolean {
	try {
		execFileSync('schtasks', args, { stdio: 'ignore' })
		return true
	} catch {
		return false
	}
}

function xml(s: string): string {
	return s
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;')
}

export function install(): void {
	// Pre-flight: refuse to install a service whose baked `watch` would throw on
	// every launch, because the service manager crash-loops it invisibly (only the
	// log file shows it). Resolving through loadConfig() is what makes this a real
	// pre-flight rather than a lookalike: it is the same call `watch` makes, so a
	// missing token fails here or not at all.
	let cfg: Config
	try {
		cfg = loadConfig()
	} catch (error) {
		console.error(fail('config', (error as Error).message))
		console.error(hint('  usagefleet login <device-token>'))
		return process.exit(1)
	}

	// A token that only ever lived in this shell's env is lost to every later
	// invocation: `usagefleet guard` runs from Claude Code's environment, which
	// carries no USAGEFLEET_* vars (hook.ts bakes the command, not the env), so the
	// token would be missing outright and the guard would fail open. Pin it to disk.
	const stored = readStore()
	if (stored.token !== cfg.token) {
		// Only on a real change: `update` re-runs install every six hours, and this
		// file is shared with the running collector's offset writes.
		updateStore(storePath(), store => {
			store.token = cfg.token
		})
	}

	console.log(header())
	console.log('')
	console.log(step('configured', host(ENDPOINT)))

	// Windows: stop a running task first, or `schtasks /run` below is ignored (the
	// task is IgnoreNew) — leaving the OLD version resident after an "update".
	if (process.platform === 'win32') {
		schtasks('/end', '/tn', TASK)
	}

	// Upgrading from a pre-npm release leaves its binary copy behind, and nothing
	// points at it once the definition below is rewritten.
	removeStableBin()
	const prog = programArgs()
	const shadow = shadowingBinary(process.env.PATH, process.argv[1] ?? process.execPath)
	if (shadow) {
		console.log(warn('path', `another usagefleet runs first · rm ${tilde(shadow)}`))
	}
	const env = presentEnv()

	// Same binary, different entry point: the service watches, the hook enforces.
	// `prog` ends in "watch"; everything before it is how to launch this build.
	installPromptHook([...prog.slice(0, -1), 'guard'])

	if (process.platform === 'darwin') {
		const envXml = env.map(([k, v]) => `    <key>${xml(k)}</key><string>${xml(v)}</string>`).join('\n')
		const progXml = prog.map(p => `    <string>${xml(p)}</string>`).join('\n')
		const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
${progXml}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envXml}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardErrorPath</key><string>${xml(join(macLogDir(), 'usagefleet.err.log'))}</string>
  <key>StandardOutPath</key><string>${xml(join(macLogDir(), 'usagefleet.out.log'))}</string>
</dict>
</plist>
`
		const path = macPlistPath()
		mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true })
		mkdirSync(macLogDir(), { recursive: true })
		// 0600: this file carries USAGEFLEET_TOKEN and ANTHROPIC_API_KEY, the same
		// secrets the config file deliberately holds at 0600.
		writeFileSync(path, plist, { encoding: 'utf-8', mode: 0o600 })
		chmodSync(path, 0o600) // writeFileSync's mode does not apply to an existing file
		const domain = `gui/${process.getuid?.()}`
		// execFile (no shell) so `path` is never subject to shell interpolation.
		// Reload-safe: boot out any previous instance first so re-running install
		// (e.g. to apply an update) swaps in the new binary instead of leaving the
		// old one resident.
		try {
			execFileSync('launchctl', ['bootout', domain, path], { stdio: 'ignore' })
		} catch {
			/* not loaded yet — fine */
		}
		try {
			execFileSync('launchctl', ['bootstrap', domain, path], {
				stdio: 'inherit',
			})
		} catch {
			try {
				execFileSync('launchctl', ['load', path], { stdio: 'inherit' })
			} catch {
				/* report below; user can load manually */
			}
		}
		// Force a (re)start so an update takes effect immediately, not on next respawn.
		try {
			execFileSync('launchctl', ['kickstart', '-k', `${domain}/${LABEL}`], {
				stdio: 'ignore',
			})
		} catch {
			/* best-effort */
		}
		console.log(step('service', 'launchd · starts at login'))
		console.log(row('logs', tilde(macLogDir())))
		return collectingNow()
	}

	if (process.platform === 'linux') {
		// systemd: quote values, escape backslash/quote, reject newlines.
		const envLines = env
			.filter(([, v]) => !/[\r\n]/.test(v))
			.map(([k, v]) => `Environment="${k}=${v.replaceAll(/[\\"]/g, m => `\\${m}`)}"`)
			.join('\n')
		const unit = `[Unit]
Description=UsageFleet collector
Wants=network-online.target
After=network-online.target
# Cap respawns so a misconfigured unit can't loop forever.
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
ExecStart=${prog.join(' ')}
Restart=always
RestartSec=30
${envLines}

[Install]
WantedBy=default.target
`
		const path = systemdUnitPath()
		mkdirSync(join(homedir(), '.config', 'systemd', 'user'), {
			recursive: true,
		})
		// 0600: the unit bakes USAGEFLEET_TOKEN and ANTHROPIC_API_KEY into Environment=.
		writeFileSync(path, unit, { encoding: 'utf-8', mode: 0o600 })
		chmodSync(path, 0o600) // writeFileSync's mode does not apply to an existing file
		// Enable + start automatically so autostart "just works". `restart` after
		// enable picks up a new binary when re-running install to apply an update
		// (enable --now leaves an already-running unit untouched).
		const sc = (...args: string[]): boolean => {
			try {
				execFileSync('systemctl', ['--user', ...args], { stdio: 'inherit' })
				return true
			} catch {
				return false
			}
		}
		const reloaded = sc('daemon-reload')
		// Clear any prior failure / start-limit lockout so a re-install (e.g. to
		// recover a unit that crash-looped on an older buggy binary) isn't rejected
		// with "start request repeated too quickly". No-op on a healthy unit.
		sc('reset-failed', 'usagefleet')
		const enabled = sc('enable', '--now', 'usagefleet')
		if (reloaded && enabled) {
			sc('restart', 'usagefleet')
			// Keep the user manager (and thus the service) alive after logout.
			const user = process.env.USER || process.env.LOGNAME
			if (user) {
				try {
					execFileSync('loginctl', ['enable-linger', user], {
						stdio: 'ignore',
					})
				} catch {
					/* not critical; service still runs while logged in */
				}
			}
			console.log(step('service', 'systemd · starts at login'))
			return collectingNow()
		}
		console.log(warn('service', 'systemctl not driveable · enable it manually'))
		console.log(hint('  systemctl --user daemon-reload'))
		console.log(hint('  systemctl --user enable --now usagefleet'))
		console.log(hint('  loginctl enable-linger $USER    keep running after logout'))
		return
	}

	if (process.platform === 'win32') {
		const vbsPath = windowsVbsPath()
		mkdirSync(stableBinDir(), { recursive: true })
		// 0600: the launcher script embeds the same secrets as the plist/unit.
		writeFileSync(vbsPath, windowsLauncherVbs(prog, env, windowsLogPath()), {
			encoding: 'utf-8',
			mode: 0o600,
		})

		// schtasks reads task XML as UTF-16 (a UTF-8 file is rejected as malformed).
		const xmlPath = join(tmpdir(), `usagefleet-task-${process.pid}.xml`)
		writeFileSync(xmlPath, `\uFEFF${windowsTaskXml(vbsPath, windowsUserId())}`, 'utf16le')
		// /f replaces any previous definition, so install doubles as the updater.
		const created =
			schtasks('/create', '/tn', TASK, '/xml', xmlPath, '/f') ||
			// Fallback for hosts that reject the XML (locale/schema quirks): a plain
			// onlogon task. Same launcher, minus restart-on-failure.
			schtasks('/create', '/tn', TASK, '/sc', 'onlogon', '/f', '/tr', `wscript.exe //B //Nologo "${vbsPath}"`)
		rmSync(xmlPath, { force: true })

		if (!created) {
			console.error(fail('service', 'scheduled task rejected · register it manually'))
			console.error(
				hint(`  schtasks /create /tn ${TASK} /sc onlogon /tr "wscript.exe //B //Nologo \\"${vbsPath}\\""`),
			)
			process.exit(1)
		}
		// Start now so install/update takes effect immediately, not at next logon.
		schtasks('/run', '/tn', TASK)
		console.log(step('service', 'scheduled task · starts at logon'))
		console.log(row('logs', tilde(windowsLogPath())))
		return collectingNow()
	}

	console.log(warn('service', `no autostart on ${process.platform} · run it yourself`))
	console.log(hint(`  ${prog.join(' ')}`))
}

/** Closing lines of a successful install: what is happening, and the two
 *  commands worth knowing next. */
function collectingNow(): void {
	console.log('')
	console.log(hint('collecting now.'))
	console.log(hint('  usagefleet status    current state'))
	console.log(hint('  usagefleet watch     foreground, live log'))
}

export interface ServiceStatus {
	state: 'running' | 'stopped' | 'not installed'
	pid?: number
}

/** Is the background service actually up? This is the one question `status`
 *  has to answer, so every probe is best-effort: an unreadable or unparseable
 *  service manager reads as stopped rather than throwing. */
export function serviceStatus(): ServiceStatus {
	// Capture stdout, silence stderr: a missing service is an expected answer here,
	// not something to spill onto the user's terminal.
	const query = (cmd: string, args: string[]): string | null => {
		try {
			return execFileSync(cmd, args, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
		} catch {
			return null
		}
	}

	if (process.platform === 'darwin') {
		if (!existsSync(macPlistPath())) {
			return { state: 'not installed' }
		}
		const out = query('launchctl', ['print', `gui/${process.getuid?.()}/${LABEL}`])
		const pid = out?.match(/\bpid = (\d+)/)?.[1]
		return pid ? { pid: Number(pid), state: 'running' } : { state: 'stopped' }
	}

	if (process.platform === 'linux') {
		if (!existsSync(systemdUnitPath())) {
			return { state: 'not installed' }
		}
		const out = query('systemctl', ['--user', 'show', 'usagefleet', '--property=ActiveState,MainPID'])
		if (!out?.includes('ActiveState=active')) {
			return { state: 'stopped' }
		}
		const pid = Number(out.match(/MainPID=(\d+)/)?.[1] ?? 0)
		return pid > 0 ? { pid, state: 'running' } : { state: 'running' }
	}

	if (process.platform === 'win32') {
		const out = query('schtasks', ['/query', '/tn', TASK, '/fo', 'list'])
		if (!out) {
			return { state: 'not installed' }
		}
		return { state: /Status:\s*Running/i.test(out) ? 'running' : 'stopped' }
	}

	return { state: 'not installed' }
}

/** Best-effort removal of the ~60 MB binary copy that pre-npm releases parked in
 *  the app-support dir (plus the `.old` file a Windows in-place update left).
 *  Runs on install too, so upgrading off the old channel reclaims the space. */
function removeStableBin(): void {
	for (const p of [stableBinPath(), `${stableBinPath()}.old`]) {
		try {
			rmSync(p, { force: true })
		} catch {
			/* ignore */
		}
	}
}

export function uninstall(): void {
	uninstallPromptHook()
	if (process.platform === 'darwin') {
		const path = macPlistPath()
		try {
			execFileSync('launchctl', ['bootout', `gui/${process.getuid?.()}`, path], {
				stdio: 'inherit',
			})
		} catch {
			try {
				execFileSync('launchctl', ['unload', path], { stdio: 'inherit' })
			} catch {
				/* ignore */
			}
		}
		removeStableBin()
		console.log(step('removed', 'launchd agent'))
		console.log(row('leftover', `${tilde(path)} · delete to fully clean up`))
		return
	}
	if (process.platform === 'linux') {
		try {
			execFileSync('systemctl', ['--user', 'disable', '--now', 'usagefleet'], {
				stdio: 'inherit',
			})
		} catch {
			/* ignore */
		}
		removeStableBin()
		console.log(step('removed', 'systemd unit'))
		console.log(row('leftover', `${tilde(systemdUnitPath())} · delete to fully clean up`))
		return
	}
	if (process.platform === 'win32') {
		schtasks('/end', '/tn', TASK)
		const deleted = schtasks('/delete', '/tn', TASK, '/f')
		try {
			rmSync(windowsVbsPath(), { force: true })
		} catch {
			/* ignore */
		}
		removeStableBin()
		console.log(deleted ? step('removed', `scheduled task ${TASK}`) : row('service', `no task ${TASK} found`))
		return
	}
	console.log(row('service', `nothing to uninstall on ${process.platform}`))
}
