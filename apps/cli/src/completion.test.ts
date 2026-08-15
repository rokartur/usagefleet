import { describe, expect, it } from 'vitest'
import { commands } from './completion.js'

describe('the advertised command list', () => {
	it('hides the entrypoints that are not for typing', () => {
		// `watch` is what the installed service runs and `version` duplicates the
		// header; neither should reach help or the completion scripts.
		const names = commands.map(c => c.name)
		expect(names).not.toContain('watch')
		expect(names).not.toContain('version')
	})
})
