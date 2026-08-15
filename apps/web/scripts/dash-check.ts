import { readFileSync } from 'node:fs'
import { getDashboard } from '../src/lib/data'

async function main() {
	const { userId } = JSON.parse(readFileSync('/tmp/usagefleet-seed.json', 'utf-8'))
	const d = await getDashboard(userId, new Date())
	console.log(
		JSON.stringify(
			{
				groups: d.groups.length,
				overallSession: d.overall.session.totalTokens,
				overallWeekly: d.overall.weekly.totalTokens,
				sessionStart: d.sessionStart?.toISOString() ?? null,
				weekStart: d.weekStart.toISOString(),
			},
			null,
			2,
		),
	)
	process.exit(0)
}
main().catch(error => {
	console.error(error)
	process.exit(1)
})
