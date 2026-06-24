/** Minimal shape needed for all usage math. DB rows and ingest records both
 *  satisfy this. `ts` is a real Date (UTC instant). */
export interface UsageRecord {
  uuid: string;
  messageId: string | null;
  requestId: string | null;
  model: string | null;
  ts: Date;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  groupId?: string | null;
  deviceId?: string | null;
  /** Which Claude app produced the row: 'cli' (Claude Code) or 'desktop'. */
  source?: string | null;
}

export interface TokenTotals {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

export const EMPTY_TOTALS: TokenTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
  totalTokens: 0,
};
