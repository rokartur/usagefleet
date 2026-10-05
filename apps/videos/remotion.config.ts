// The Dashboard take renders the web app's own components, so the bundler
// needs its `@/` alias, its Tailwind pipeline, and a router stub (the
// components link with TanStack Router; no router runs inside a video).
// Paths hang off cwd: every script here runs from the workspace root.
import path from 'node:path'
import { Config } from '@remotion/cli/config'
import { enableTailwind } from '@remotion/tailwind-v4'

Config.overrideWebpackConfig(config =>
	enableTailwind({
		...config,
		resolve: {
			...config.resolve,
			alias: {
				...config.resolve?.alias,
				'@': path.resolve(process.cwd(), '../web/src'),
				'@tanstack/react-router': path.resolve(process.cwd(), 'src/dashboard/router-stub.tsx'),
			},
		},
	}),
)
