// Dev/E2E helper: insert a user + device and print its token. NOT shipped.
import { randomUUID } from 'node:crypto'
import { db } from '../src/db'
import { devices, user } from '../src/db/schema'
import { generateDeviceToken } from '../src/lib/device-token'

async function main() {
	const uid = randomUUID()
	await db.insert(user).values({
		email: `e2e+${uid}@test.local`,
		emailVerified: true,
		id: uid,
		name: 'E2E',
	})
	const { token, tokenHash, tokenPrefix } = generateDeviceToken()
	const did = randomUUID()
	await db.insert(devices).values({
		id: did,
		name: 'e2e-device',
		tokenHash,
		tokenPrefix,
		userId: uid,
	})
	console.log(JSON.stringify({ deviceId: did, token, userId: uid }))
	process.exit(0)
}

main().catch(error => {
	console.error(error)
	process.exit(1)
})
