import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export * as schema from './schema'

const connectionString =
	process.env.DATABASE_URL ??
	(process.env.NODE_ENV === 'production'
		? (() => {
				throw new Error('DATABASE_URL is not set')
			})()
		: 'postgresql://app:app@localhost:5432/app')

// Reuse a single client across hot-reloads in dev.
// max 10 matches one standalone server; connect/idle timeouts avoid hung sockets
// against managed Postgres. SSL is taken from the URL (e.g. ?sslmode=require).
//
// statement_timeout bounds how long one query may hold its connection. Without
// it a single slow scan keeps its slot until it finishes, so ten of them empty
// the pool and every other request — ingest, guard, sign-in — queues behind them
// with nothing in the logs to say why. 15s is far above any query on a hot path
// and still releases the pool long before a user gives up. The one query that
// can legitimately approach it is the all-time history scan (data.ts), which is
// unbounded by design and runs at most once a minute per user behind its cache;
// past that size it needs a retention or rollup policy, not a longer ceiling.
const globalForDb = globalThis as unknown as {
	__pg?: ReturnType<typeof postgres>
}
const client =
	globalForDb.__pg ??
	postgres(connectionString, {
		connect_timeout: 10,
		connection: { statement_timeout: 15_000 },
		idle_timeout: 20,
		max: 10,
		prepare: false,
	})
if (process.env.NODE_ENV !== 'production') {
	globalForDb.__pg = client
}

export const db = drizzle(client, { schema })
