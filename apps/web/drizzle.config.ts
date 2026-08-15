import { defineConfig } from 'drizzle-kit'

export default defineConfig({
	dbCredentials: {
		url: process.env.DATABASE_URL ?? 'postgresql://app:app@localhost:5432/app',
	},
	dialect: 'postgresql',
	out: './drizzle',
	schema: './src/db/schema.ts',
})
