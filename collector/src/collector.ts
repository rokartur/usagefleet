import { hostname } from "node:os";
import { detectClaudeCreds } from "./claude-creds.js";
import { fetchLimits, type LimitsReport } from "./claude-limits.js";
import { detectOs } from "./os.js";
import { listJsonlFiles } from "./scanner.js";
import { loadState, saveState } from "./state.js";
import { tailFile } from "./tailer.js";
import { postLimits, uploadBatch } from "./uploader.js";
import type { Config } from "./types.js";

export const COLLECTOR_VERSION = "1.0.0";

export interface CycleResult {
  files: number;
  sent: number;
  accepted: number;
  duplicates: number;
  failed: boolean;
}

/**
 * One full scan: tail every JSONL file from its stored offset, upload new usage
 * records (chunked to batchSize), and commit each file's offset only after all
 * its chunks are acknowledged (at-least-once; the server dedups on uuid).
 */
export async function runOnce(
  cfg: Config,
  log: (msg: string) => void = () => {},
): Promise<CycleResult> {
  const state = loadState(cfg.statePath);
  const files = listJsonlFiles(cfg.projectsDir);
  const result: CycleResult = {
    files: files.length,
    sent: 0,
    accepted: 0,
    duplicates: 0,
    failed: false,
  };

  // Defensive: a bad batchSize must never stall the chunk loop.
  const step = cfg.batchSize > 0 ? Math.floor(cfg.batchSize) : 100;

  for (const fp of files) {
    let tail;
    try {
      tail = tailFile(fp, state.files[fp]);
    } catch (err) {
      // One unreadable/oversized file must not abort the whole cycle.
      log(`skip ${fp}: ${(err as Error).message}`);
      continue;
    }
    if (!tail || tail.consumedBytes === 0) continue;

    if (tail.records.length === 0) {
      // Consumed only non-usage lines — safe to advance immediately.
      state.files[fp] = tail.nextState;
      saveState(cfg.statePath, state);
      continue;
    }

    let ok = true;
    for (let i = 0; i < tail.records.length; i += step) {
      const chunk = tail.records.slice(i, i + step);
      const res = await uploadBatch(
        {
          os: detectOs(),
          hostname: hostname(),
          collectorVersion: COLLECTOR_VERSION,
          sentAt: new Date().toISOString(),
          records: chunk,
        },
        cfg,
      );
      if (!res.ok) {
        ok = false;
        break;
      }
      result.sent += chunk.length;
      result.accepted += res.accepted ?? 0;
      result.duplicates += res.duplicates ?? 0;
    }

    if (ok) {
      state.files[fp] = tail.nextState;
      saveState(cfg.statePath, state);
    } else {
      log(`upload failed for ${fp}; will retry next cycle`);
      result.failed = true;
      break;
    }
  }

  return result;
}

/**
 * Auto-detect the local Claude login, read the real 5h/weekly utilization from
 * Anthropic's rate-limit headers, and report it to the server. Best-effort —
 * returns null (and logs) when no login is found or the request fails.
 */
export async function reportLimitsOnce(
  cfg: Config,
  log: (msg: string) => void = () => {},
): Promise<LimitsReport | null> {
  const creds = detectClaudeCreds();
  if (!creds) {
    log("no Claude login detected — skipping limits (sign in with `claude` or set ANTHROPIC_API_KEY)");
    return null;
  }
  let report: LimitsReport;
  try {
    report = await fetchLimits(creds);
  } catch (err) {
    log(`limits fetch failed: ${(err as Error).message}`);
    return null;
  }
  const ok = await postLimits(report, cfg);
  if (!ok) log("limits upload failed");
  return report;
}
