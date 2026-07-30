export type OsName = "mac" | "linux" | "windows" | string;

/** Which app produced a record. `cli` = Claude Code (`~/.claude/projects`);
 *  `desktop` = Claude Desktop agent-mode/Cowork sessions (same JSONL format under
 *  the app's `local-agent-mode-sessions/<session>/.claude/projects`);
 *  `pi` = the pi coding agent (`~/.pi/agent/sessions`, its own JSONL format —
 *  only records with provider "anthropic" count against Claude limits). */
export type UsageSource = "cli" | "desktop" | "pi";

/** Wire record sent to POST /api/v1/usage. Field names match the server's
 *  zod schema (src/app/api/v1/usage/route.ts). */
export interface UsageRecord {
  uuid: string;
  messageId: string | null;
  requestId: string | null;
  model: string | null;
  sessionId: string | null;
  timestamp: string;
  cwd: string | null;
  gitBranch: string | null;
  version: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  serviceTier: string | null;
  source: UsageSource;
}

export interface BatchPayload {
  os: OsName;
  hostname: string;
  collectorVersion: string;
  sentAt: string;
  records: UsageRecord[];
}

export interface FileState {
  inode: number;
  dev: number;
  size: number;
  offset: number;
  mtimeMs: number;
}

export interface StateFile {
  version: 1;
  deviceId: string;
  files: Record<string, FileState>;
  updatedAt: string;
}

export interface Config {
  endpoint: string;
  token: string;
  statePath: string;
  projectsDir: string;
  /** Claude Desktop agent-mode sessions root to also scan, or null to disable. */
  desktopDir: string | null;
  /** pi agent sessions root to also scan, or null to disable. */
  piDir: string | null;
  batchSize: number;
}
