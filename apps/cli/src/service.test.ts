import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { looksLikeCompiledBinary, shadowingBinary, windowsLauncherVbs, windowsTaskXml } from './service.js'

describe(shadowingBinary, () => {
	// npm's global bin is a symlink into the package, so the install being checked
	// and the file on PATH are one executable under two names.
	it('accepts the npm bin symlink pointing at this install', () => {
		const root = mkdtempSync(join(tmpdir(), 'uf-path-'))
		const bin = join(root, 'bin')
		const pkg = join(root, 'lib', 'dist')
		mkdirSync(bin, { recursive: true })
		mkdirSync(pkg, { recursive: true })
		const self = join(pkg, 'index.js')
		writeFileSync(self, '#!/usr/bin/env node')
		symlinkSync(self, join(bin, 'usagefleet'))

		expect(shadowingBinary(bin, self)).toBeNull()
	})

	// The pre-npm installer dropped a standalone binary in /usr/local/bin, which
	// most PATHs put ahead of the npm prefix.
	it('reports an older binary that PATH reaches first', () => {
		const root = mkdtempSync(join(tmpdir(), 'uf-path-'))
		const old = join(root, 'usr-local-bin')
		const npm = join(root, 'npm-bin')
		mkdirSync(old)
		mkdirSync(npm)
		const self = join(npm, 'usagefleet')
		writeFileSync(self, 'new')
		writeFileSync(join(old, 'usagefleet'), 'old binary')

		expect(shadowingBinary([old, npm].join(delimiter), self)).toBe(join(old, 'usagefleet'))
		expect(shadowingBinary([npm, old].join(delimiter), self)).toBeNull()
	})
})

describe(looksLikeCompiledBinary, () => {
	it('treats `node dist/index.js` as NOT a compiled binary', () => {
		expect(looksLikeCompiledBinary('/opt/app/collector/dist/index.js', '/usr/bin/node')).toBeFalsy()
	})

	it('detects a bun --compile binary by its /$bunfs/ virtual entry', () => {
		// Regression: this argv[1] used to be mistaken for a real script, baking a
		// bogus path into the service command so the launched process just printed
		// help and exited.
		expect(
			looksLikeCompiledBinary('/$bunfs/root/usagefleet-macos-arm64', '/Users/me/.local/bin/usagefleet'),
		).toBeTruthy()
	})

	it('detects a bun --compile binary on Windows (~BUN path)', () => {
		expect(
			looksLikeCompiledBinary('B:\\~BUN\\root\\usagefleet-windows-x64.exe', 'C:\\Users\\me\\usagefleet.exe'),
		).toBeTruthy()
	})

	it('treats a missing argv[1] as a compiled binary', () => {
		expect(looksLikeCompiledBinary(undefined, '/x/usagefleet')).toBeTruthy()
	})

	it('treats argv[1] === execPath as a compiled binary', () => {
		expect(looksLikeCompiledBinary('/x/usagefleet', '/x/usagefleet')).toBeTruthy()
	})
})

describe(windowsLauncherVbs, () => {
	const script = windowsLauncherVbs(
		['C:\\Program Files\\usagefleet\\usagefleet.exe', 'watch'],
		[
			['USAGEFLEET_TOKEN', 'uf_a"b'],
			['USAGEFLEET_BROKEN', 'line1\nline2'],
		],
		'C:\\logs\\usagefleet.log',
	)

	it('runs the collector hidden, logged, and waits for it', () => {
		// window style 0 = no console window; True = wait, so the Scheduled Task
		// instance lives as long as the collector (restart-on-failure works).
		// Unescaped, the VBS literal is the canonical cmd form:
		//   cmd /c ""C:\..\usagefleet.exe" "watch" > "C:\logs\usagefleet.log" 2>&1"
		expect(script).toContain(
			'sh.Run "cmd /c """"C:\\Program Files\\usagefleet\\usagefleet.exe"" ""watch"" > ""C:\\logs\\usagefleet.log"" 2>&1""", 0, True',
		)
	})

	it('escapes quotes in env values and drops unrepresentable newlines', () => {
		expect(script).toContain('env("USAGEFLEET_TOKEN") = "uf_a""b"')
		expect(script).not.toContain('USAGEFLEET_BROKEN')
	})
})

describe(windowsTaskXml, () => {
	it('escapes the user id and points the action at the launcher', () => {
		const xml = windowsTaskXml('C:\\usagefleet\\watch.vbs', 'AC&ME\\me')
		expect(xml).toContain('<UserId>AC&amp;ME\\me</UserId>')
		expect(xml).toContain('<Arguments>//B //Nologo "C:\\usagefleet\\watch.vbs"</Arguments>')
		expect(xml).toContain('<LogonTrigger>')
	})
})
