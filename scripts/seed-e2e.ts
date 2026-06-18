// Dev/E2E helper: insert a user + device and print its token. NOT shipped.
import { randomUUID } from "node:crypto";
import { db } from "../src/db";
import { devices, user } from "../src/db/schema";
import { generateDeviceToken } from "../src/lib/device-token";

async function main() {
  const uid = randomUUID();
  await db.insert(user).values({
    id: uid,
    name: "E2E",
    email: `e2e+${uid}@test.local`,
    emailVerified: true,
  });
  const { token, tokenHash, tokenPrefix } = generateDeviceToken();
  const did = randomUUID();
  await db.insert(devices).values({
    id: did,
    userId: uid,
    name: "e2e-device",
    tokenHash,
    tokenPrefix,
  });
  console.log(JSON.stringify({ userId: uid, deviceId: did, token }));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
