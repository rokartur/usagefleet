import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { StateFile } from "./types.js";

export function loadState(path: string): StateFile {
  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as StateFile;
    if (raw && raw.version === 1 && raw.files) {
      if (!raw.deviceId) {
        raw.deviceId = randomUUID();
        try {
          saveState(path, raw); // write back so the id is stable across runs
        } catch {
          /* read-only fs — id stays in-memory for this run */
        }
      }
      return raw;
    }
  } catch {
    /* missing or corrupt → fresh state */
  }
  return {
    version: 1,
    deviceId: randomUUID(),
    files: {},
    updatedAt: new Date().toISOString(),
  };
}

/** Atomic write: tmp file + rename, so a crash mid-write can't corrupt state. */
export function saveState(path: string, state: StateFile): void {
  state.updatedAt = new Date().toISOString();
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  renameSync(tmp, path);
}
