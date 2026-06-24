import type { UsageRecord, UsageSource } from "./types.js";

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_5m_input_tokens?: number;
    ephemeral_1h_input_tokens?: number;
  };
  service_tier?: string;
}

/** Only accept genuine strings; ignores numbers/objects that would later break. */
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** A valid ISO-ish timestamp string, else the current time (never an invalid one). */
function validTimestamp(v: unknown): string {
  if (typeof v === "string" && !Number.isNaN(new Date(v).getTime())) return v;
  return new Date().toISOString();
}

function cacheCreation(u: RawUsage): number {
  if (typeof u.cache_creation_input_tokens === "number") {
    return u.cache_creation_input_tokens;
  }
  const c = u.cache_creation;
  if (c) {
    return (c.ephemeral_5m_input_tokens ?? 0) + (c.ephemeral_1h_input_tokens ?? 0);
  }
  return 0;
}

/**
 * Parse a single JSONL line. Returns a UsageRecord only for assistant messages
 * that carry a usage object; everything else (user/system/summary/tool/…) → null.
 * `uuid` is the per-line idempotency key the server dedups on. `source` tags which
 * Claude app the file came from (the line itself carries no app identifier).
 */
export function parseLine(
  line: string,
  source: UsageSource = "cli",
): UsageRecord | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (o.type !== "assistant") return null;
  const message = o.message as
    | { id?: string; model?: string; usage?: RawUsage }
    | undefined;
  if (!message || typeof message.usage !== "object" || message.usage === null) {
    return null;
  }
  const uuid = o.uuid;
  if (typeof uuid !== "string" || !uuid) return null;

  const u = message.usage;
  return {
    uuid,
    messageId: str(message.id),
    requestId: str(o.requestId),
    model: str(message.model),
    sessionId: str(o.sessionId),
    timestamp: validTimestamp(o.timestamp),
    cwd: str(o.cwd),
    gitBranch: str(o.gitBranch),
    version: str(o.version),
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: cacheCreation(u),
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
    serviceTier: u.service_tier ?? null,
    source,
  };
}
