// Runtime migrator — runs inside the container entrypoint (drizzle-kit is a
// devDependency and absent from the standalone image). Idempotent: applied
// migrations are tracked in __drizzle_migrations by content hash.
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

async function main() {
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error('DATABASE_URL is not set')
	}

	const client = postgres(url, { max: 1 })
	const db = drizzle(client)
	await migrate(db, { migrationsFolder: './drizzle' })
	await client.end()
	console.log('migrations applied')
}

main().catch(error => {
	console.error(error)
	process.exit(1)
})
