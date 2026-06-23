import { hostname } from "node:os";
import { detectClaudeCreds, macKeychainDenied } from "./claude-creds.js";
import { fetchLimits, type LimitsReport } from "./claude-limits.js";
import { detectOs } from "./os.js";
import { listJsonlFiles } from "./scanner.js";
import { loadState, saveState } from "./state.js";
import { tailFile } from "./tailer.js";
import { postLimits, uploadBatch, type UploadFailure } from "./uploader.js";
import type { Config } from "./types.js";

export const COLLECTOR_VERSION = "1.0.0";

export interface CycleResult {
  files: number;
  sent: number;
  accepted: number;
  duplicates: number;
  failed: boolean;
  /** True when the server rejected the device token (401/403). */
  authFailed: boolean;
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
    authFailed: false,
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

    let outcome: "ok" | UploadFailure = "ok";
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
      if (res.ok) {
        result.sent += chunk.length;
        result.accepted += res.accepted ?? 0;
        result.duplicates += res.duplicates ?? 0;
        continue;
      }
      outcome = res.fatal;
      break;
    }

    if (outcome === "ok") {
      state.files[fp] = tail.nextState;
      saveState(cfg.statePath, state);
    } else if (outcome === "invalid") {
      // Server rejected these records as malformed (400/422). Advancing past
      // them is the only way to avoid re-POSTing the same failing chunk every
      // cycle forever; they are dropped (the server dedups, so nothing valid is
      // lost on the retry path). Loud log so it's diagnosable.
      log(`server rejected records from ${fp} (400/422) — skipping them to avoid a stall`);
      state.files[fp] = tail.nextState;
      saveState(cfg.statePath, state);
      result.failed = true;
    } else if (outcome === "auth") {
      // Token revoked/expired. The data is valid and must NOT be skipped — keep
      // the offset so it uploads once a fresh token is configured. Retrying the
      // remaining files would 401 identically, so stop this cycle and surface.
      log(`auth rejected (401/403) — device token invalid or revoked; re-run \`claude-track init\` with a fresh token, then restart the service`);
      result.failed = true;
      result.authFailed = true;
      break;
    } else {
      // transient (5xx / network, retries exhausted): keep the offset and retry
      // next cycle, but DO NOT break — later files must still get their chance.
      log(`upload failed for ${fp} (transient) — will retry next cycle`);
      result.failed = true;
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
    if (process.platform === "darwin" && macKeychainDenied()) {
      // "Works by hand, broken as a service" signature: a launchd agent can be
      // denied the login-Keychain read. Make it diagnosable instead of silent.
      log(
        "limits skipped: login Keychain read for 'Claude Code-credentials' was denied " +
          "(typical under a background launchd agent). Grant /usr/bin/security access to the " +
          "item, or set ANTHROPIC_API_KEY for the service.",
      );
    } else {
      log("no Claude login detected — skipping limits (sign in with `claude` or set ANTHROPIC_API_KEY)");
    }
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
