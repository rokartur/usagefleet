import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

// Ultracite's preset with the house formatting style on top: tabs, single
// quotes, no semicolons, 120 columns, imports grouped by layer.
export default defineConfig({
	...ultracite,
	arrowParens: 'avoid',
	bracketSameLine: false,
	bracketSpacing: true,
	endOfLine: 'lf',
	// Markdown and YAML stay hand-wrapped: `proseWrap: never` would collapse the
	// docs into single-line paragraphs and re-indent the workflows.
	ignorePatterns: [...(ultracite.ignorePatterns ?? []), '**/drizzle', '**/*.md', '**/*.yml', '**/*.yaml'],
	insertFinalNewline: true,
	jsxSingleQuote: true,
	printWidth: 120,
	proseWrap: 'never',
	quoteProps: 'as-needed',
	semi: false,
	singleAttributePerLine: false,
	singleQuote: true,
	sortImports: {
		customGroups: [
			{ elementNamePattern: ['react', 'react/**'], groupName: 'react' },
			{ elementNamePattern: ['@/components', '@/components/**'], groupName: 'app-components' },
			{ elementNamePattern: ['@/hooks', '@/hooks/**'], groupName: 'app-hooks' },
			{ elementNamePattern: ['@/db', '@/db/**'], groupName: 'app-db' },
			{ elementNamePattern: ['@/lib', '@/lib/**'], groupName: 'app-lib' },
			{ elementNamePattern: ['.', '..', './*', './**', '../*', '../**'], groupName: 'relative' },
		],
		groups: [
			'builtin',
			'react',
			'external',
			'app-components',
			'app-hooks',
			'app-db',
			'app-lib',
			'internal',
			'relative',
			'unknown',
		],
		ignoreCase: true,
		newlinesBetween: false,
		order: 'asc',
	},
	sortTailwindcss: {
		attributes: ['class', 'className'],
		functions: ['clsx', 'cn', 'cva', 'tw'],
		preserveDuplicates: false,
		preserveWhitespace: false,
		// Tailwind v4 theme lives in CSS, so sorting needs the stylesheet to know
		// the project's custom utilities.
		stylesheet: './apps/web/src/styles/globals.css',
	},
	tabWidth: 4,
	trailingComma: 'all',
	useTabs: true,
})
