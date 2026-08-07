import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Fail fast at runtime in production, but never during `next build` (the page-
// data collection phase loads this module without a DB and must not throw).
const connectionString =
  process.env.DATABASE_URL ??
  (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build"
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
