import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  defaultConfigPath,
  defaultDesktopSessionsDir,
  defaultProjectsDir,
  defaultStatePath,
} from "./paths.js";
import type { Config } from "./types.js";

interface FileConfig {
  endpoint?: string;
  token?: string;
  deviceId?: string;
  projectsDir?: string;
  desktopDir?: string;
}

export function readFileConfig(): FileConfig {
  try {
    return JSON.parse(readFileSync(defaultConfigPath(), "utf8")) as FileConfig;
  } catch {
    return {};
  }
}

/** Resolve config from env first, then ~/.claude-track.json. */
export function loadConfig(): Config {
  const file = readFileConfig();
  // Use `||` (not `??`) so an empty-string env var falls back to the config
  // file — launchd/systemd units may inject empty CLAUDE_TRACK_* values.
  const endpoint = (process.env.CLAUDE_TRACK_ENDPOINT || file.endpoint || "").replace(/\/+$/, "");
  const token = process.env.CLAUDE_TRACK_TOKEN || file.token || "";
  if (!endpoint) throw new Error("CLAUDE_TRACK_ENDPOINT is not set");
  if (!token) throw new Error("CLAUDE_TRACK_TOKEN is not set");
  // Guard batch size: "0" (infinite loop), NaN (silent drop), fractional → 100.
  const parsedBatch = Math.floor(Number(process.env.CLAUDE_TRACK_BATCH));
  const batchSize = Number.isFinite(parsedBatch) && parsedBatch > 0 ? parsedBatch : 100;
  return {
    endpoint,
    token,
    statePath: defaultStatePath(),
    projectsDir: process.env.CLAUDE_TRACK_PROJECTS || file.projectsDir || defaultProjectsDir(),
    desktopDir: resolveDesktopDir(file.desktopDir),
    batchSize,
  };
}

/** Claude Desktop agent-mode sessions root, or null when disabled. Set
 *  CLAUDE_TRACK_DESKTOP to "off"/"0" to turn off desktop collection, or to a
 *  path to override the auto-detected location. */
function resolveDesktopDir(fromFile?: string): string | null {
  const env = process.env.CLAUDE_TRACK_DESKTOP;
  if (env === "0" || env?.toLowerCase() === "off") return null;
  return env || fromFile || defaultDesktopSessionsDir();
}

/** Stable per-install device id, persisted in the state file's deviceId. */
export function ensureDeviceId(existing?: string): string {
  return existing && existing.length > 0 ? existing : randomUUID();
}
