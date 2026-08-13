import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  defaultConfigPath,
  defaultDesktopSessionsDir,
  defaultPiSessionsDirs,
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
  /** One path, or several (pi's session root moves with PI_CODING_AGENT_DIR). */
  piDir?: string | string[];
}

export function readFileConfig(): FileConfig {
  try {
    return JSON.parse(readFileSync(defaultConfigPath(), "utf8")) as FileConfig;
  } catch {
    return {};
  }
}

/** Resolve config from env first, then ~/.usagefleet.json. */
export function loadConfig(): Config {
  const file = readFileConfig();
  // Use `||` (not `??`) so an empty-string env var falls back to the config
  // file — launchd/systemd units may inject empty USAGEFLEET_* values.
  const endpoint = (process.env.USAGEFLEET_ENDPOINT || file.endpoint || "").replace(/\/+$/, "");
  const token = process.env.USAGEFLEET_TOKEN || file.token || "";
  if (!endpoint) throw new Error("USAGEFLEET_ENDPOINT is not set");
  if (!token) throw new Error("USAGEFLEET_TOKEN is not set");
  // Guard batch size: "0" (infinite loop), NaN (silent drop), fractional → 100.
  const parsedBatch = Math.floor(Number(process.env.USAGEFLEET_BATCH));
  const batchSize = Number.isFinite(parsedBatch) && parsedBatch > 0 ? parsedBatch : 100;
  return {
    endpoint,
    token,
    statePath: defaultStatePath(),
    projectsDir: process.env.USAGEFLEET_PROJECTS || file.projectsDir || defaultProjectsDir(),
    desktopDir: resolveOptionalDir(
      process.env.USAGEFLEET_DESKTOP,
      file.desktopDir,
      defaultDesktopSessionsDir(),
    ),
    piDirs: resolvePiDirs(process.env.USAGEFLEET_PI, file.piDir),
    batchSize,
  };
}

/** pi scan roots: env "off"/"0" disables, else a comma-separated env list, else
 *  the config file's string-or-array, else every auto-detected default. */
export function resolvePiDirs(
  env: string | undefined,
  fromFile: string | string[] | undefined,
): string[] {
  if (env === "0" || env?.toLowerCase() === "off") return [];
  const raw = env
    ? env.split(",")
    : Array.isArray(fromFile)
      ? fromFile
      : fromFile
        ? [fromFile]
        : null;
  if (!raw) return defaultPiSessionsDirs();
  return [...new Set(raw.map((d) => d.trim()).filter((d) => d.length > 0))];
}

/** Optional scan root (USAGEFLEET_DESKTOP / USAGEFLEET_PI): env "off"/"0"
 *  disables, env or config-file path overrides, else the auto-detected default. */
function resolveOptionalDir(
  env: string | undefined,
  fromFile: string | undefined,
  fallback: string,
): string | null {
  if (env === "0" || env?.toLowerCase() === "off") return null;
  return env || fromFile || fallback;
}

/** Stable per-install device id, persisted in the state file's deviceId. */
export function ensureDeviceId(existing?: string): string {
  return existing && existing.length > 0 ? existing : randomUUID();
}
