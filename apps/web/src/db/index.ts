import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Fail fast in production. `vite build` only bundles this module, so unlike
// `next build` there is no build phase that loads it without a database.
const connectionString =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "production"
    ? (() => {
        throw new Error("DATABASE_URL is not set");
      })()
    : "postgresql://app:app@localhost:5432/app");

// Reuse a single client across hot-reloads in dev.
// max 10 matches one standalone server; connect/idle timeouts avoid hung sockets
// against managed Postgres. SSL is taken from the URL (e.g. ?sslmode=require).
const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
const client =
  globalForDb.__pg ??
  postgres(connectionString, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
if (process.env.NODE_ENV !== "production") globalForDb.__pg = client;

export const db = drizzle(client, { schema });
export { schema };
