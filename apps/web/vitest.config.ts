import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	// Mirror the tsconfig "@/" -> src alias so lib modules are importable in tests.
	resolve: { alias: { '@': fileURLToPath(new URL('src', import.meta.url)) } },
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
})
