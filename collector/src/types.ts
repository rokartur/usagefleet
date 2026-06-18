export type OsName = "mac" | "linux" | "windows" | string;

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
  batchSize: number;
}
