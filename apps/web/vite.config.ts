import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
	server: { port: 3000 },
	// Resolves the "@/*" -> "./src/*" alias from tsconfig.json.
	resolve: { tsconfigPaths: true },
	plugins: [
		tailwindcss(),
		tanstackStart(),
		// react's plugin must come after start's plugin
		viteReact(),
		nitro({ preset: 'bun' }),
	],
})
