import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// Pin Node runtime + request-time execution: this handler reads cookies/headers
// and hits the DB, and must never be prerendered or moved to the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { POST, GET } = toNextJsHandler(auth);
