import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  defaultConfigPath,
  defaultDesktopSessionsDir,
  defaultPiSessionsDir,
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
  piDir?: string;
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
    desktopDir: resolveOptionalDir(process.env.CLAUDE_TRACK_DESKTOP, file.desktopDir, defaultDesktopSessionsDir()),
    piDir: resolveOptionalDir(process.env.CLAUDE_TRACK_PI, file.piDir, defaultPiSessionsDir()),
    batchSize,
  };
}

/** Optional scan root (CLAUDE_TRACK_DESKTOP / CLAUDE_TRACK_PI): env "off"/"0"
 *  disables, env or config-file path overrides, else the auto-detected default. */
function resolveOptionalDir(env: string | undefined, fromFile: string | undefined, fallback: string): string | null {
  if (env === "0" || env?.toLowerCase() === "off") return null;
  return env || fromFile || fallback;
}

/** Stable per-install device id, persisted in the state file's deviceId. */
export function ensureDeviceId(existing?: string): string {
  return existing && existing.length > 0 ? existing : randomUUID();
}
