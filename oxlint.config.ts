import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'
import tanstack from 'ultracite/oxlint/tanstack'
import vitest from 'ultracite/oxlint/vitest'

// A preset's own `overrides` win over this config's `overrides`, so per-file
// relaxations have to ship as the last entry of `extends` instead.
const houseOverrides = defineConfig({
	overrides: [
		{
			// Focused tests assert as much as they need to, and mock helpers are
			// typed by inference.
			files: ['**/*.test.ts', '**/*.test.tsx'],
			plugins: ['vitest'],
			rules: {
				'vitest/max-expects': 'off',
				'vitest/require-mock-type-parameters': 'off',
				'vitest/require-top-level-describe': 'off',
			},
		},
		{
			// Vendored shadcn registry components: kept re-installable by the CLI,
			// so they are not edited to satisfy rules the registry doesn't follow.
			files: ['apps/web/src/components/ui/**'],
			plugins: ['jsx-a11y'],
			rules: {
				'jsx-a11y/anchor-has-content': 'off',
				'jsx-a11y/click-events-have-key-events': 'off',
				'jsx-a11y/label-has-associated-control': 'off',
				'jsx-a11y/no-noninteractive-element-interactions': 'off',
				'jsx-a11y/prefer-tag-over-role': 'off',
			},
		},
	],
})

export default defineConfig({
	extends: [core, react, tanstack, vitest, houseOverrides],
	// drizzle/ holds drizzle-kit generated migrations and is committed, so it is
	// not covered by the preset's build-artifact ignores.
	ignorePatterns: [...(core.ignorePatterns ?? []), '**/drizzle'],
	// Ultracite opts out rather than in, so a handful of its rules only exist to
	// rewrite style this codebase already settled on. Everything still enabled is
	// a bug check or something worth converging on.
	rules: {
		// Components and helpers are `function` declarations throughout.
		'func-style': 'off',
		'no-inline-comments': 'off',
		'no-nested-ternary': 'off',
		'no-plusplus': 'off',
		// Hoisted functions are called before their definition on purpose; the TDZ
		// check for variables and classes stays on.
		'no-use-before-define': ['error', { functions: false }],
		'react/function-component-definition': 'off',
		'sort-keys': 'off',
		// Filenames follow TanStack Router and shadcn conventions.
		'unicorn/filename-case': 'off',
		'unicorn/no-nested-ternary': 'off',
	},
})
