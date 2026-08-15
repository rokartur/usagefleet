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
			plugins: ['vitest', 'typescript'],
			rules: {
				// Fixtures have a known shape, so `rows[0]!.total` beats a guard per assertion.
				'typescript/no-non-null-assertion': 'off',
				'vitest/max-expects': 'off',
				'vitest/require-mock-type-parameters': 'off',
				'vitest/require-top-level-describe': 'off',
			},
		},
		{
			// Vendored shadcn registry components: kept re-installable by the CLI,
			// so they are not edited to satisfy rules the registry doesn't follow.
			files: ['apps/web/src/components/ui/**'],
			plugins: ['jsx-a11y', 'react', 'unicorn'],
			rules: {
				complexity: 'off',
				'jsx-a11y/anchor-has-content': 'off',
				'jsx-a11y/click-events-have-key-events': 'off',
				'jsx-a11y/label-has-associated-control': 'off',
				'jsx-a11y/no-noninteractive-element-interactions': 'off',
				'jsx-a11y/prefer-tag-over-role': 'off',
				'no-param-reassign': 'off',
				'no-use-before-define': 'off',
				'react/button-has-type': 'off',
				'react/hook-use-state': 'off',
				'react/jsx-no-constructed-context-values': 'off',
				'react/no-danger': 'off',
				'react/no-object-type-as-default-prop': 'off',
				'react/no-unstable-nested-components': 'off',
				'react/react-compiler': 'off',
				'unicorn/no-document-cookie': 'off',
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
		// A few parsers and CLI commands branch a lot by nature; 30 still catches
		// anything genuinely out of hand.
		complexity: ['error', 30],
		// db/schema.ts is drizzle's table barrel and is imported as one on purpose.
		'oxc/no-barrel-file': 'off',
		// `x == null` is the idiomatic single test for null and undefined and is used
		// deliberately; every other loose comparison stays an error.
		eqeqeq: ['error', 'always', { null: 'ignore' }],
		// Bit twiddling is deliberate where it appears (hashing, byte math).
		'no-bitwise': 'off',
		// Switches over union types rely on TypeScript exhaustiveness instead.
		'default-case': 'off',
		// Components and helpers are `function` declarations throughout.
		'func-style': 'off',
		'no-await-in-loop': 'off',
		'no-eq-null': 'off',
		'no-inline-comments': 'off',
		'no-nested-ternary': 'off',
		'no-plusplus': 'off',
		// Inner scopes reusing an outer name (`user`, `db`, `res`) read fine here.
		'no-shadow': 'off',
		// Hoisted functions are called before their definition on purpose; the TDZ
		// check for variables and classes stays on.
		'no-use-before-define': ['error', { functions: false }],
		'prefer-destructuring': 'off',
		'prefer-named-capture-group': 'off',
		// Node stream and process APIs are callback-shaped; wrapping them in promises
		// just to satisfy a rule adds a layer.
		'promise/avoid-new': 'off',
		'promise/prefer-await-to-callbacks': 'off',
		'promise/prefer-await-to-then': 'off',
		'react/function-component-definition': 'off',
		// `const [initial] = useState(...)` for a mount-stable value is deliberate.
		'react/hook-use-state': 'off',
		// Render props (recharts formatters, table cell renderers) are functions the
		// parent hands down, not components remounted on every render.
		'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
		// `class ReleaseUnavailable extends Error {}` needs no constructor boilerplate.
		'unicorn/custom-error-definition': 'off',
		// Async signatures are part of the contract even when a body has no `await`.
		'require-await': 'off',
		// The `u` flag changes nothing for these ASCII patterns.
		'require-unicode-regexp': 'off',
		'sort-keys': 'off',
		'unicorn/consistent-function-scoping': 'off',
		// Filenames follow TanStack Router and shadcn conventions.
		'unicorn/filename-case': 'off',
		'unicorn/import-style': 'off',
		'unicorn/no-array-reduce': 'off',
		'unicorn/no-await-expression-member': 'off',
		'unicorn/no-nested-ternary': 'off',
	},
})
