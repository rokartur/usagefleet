import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
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

/**
 * Durable atomic write: write to a per-process tmp file, fsync it, rename over
 * the target, then fsync the directory. The per-pid tmp name means two
 * concurrent collectors (e.g. the installed service + a manual `run`) can never
 * clobber a shared `.tmp` and publish corrupt JSON; the rename is atomic so a
 * reader never sees a half-written file, and the fsyncs make the committed
 * offsets survive a power loss (otherwise a crash could truncate state and reset
 * every offset to 0, forcing a full re-tail).
 */
export function saveState(path: string, state: StateFile): void {
  state.updatedAt = new Date().toISOString();
  const tmp = `${path}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  const data = JSON.stringify(state, null, 2);
  try {
    const fd = openSync(tmp, "w");
    try {
      writeSync(fd, data, 0, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, path);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      /* tmp may not exist */
    }
    throw err;
  }
  // Best-effort directory fsync so the rename's entry is durable. Some platforms
  // (e.g. Windows) reject opening a directory for fsync — ignore there.
  try {
    const dirFd = openSync(dirname(path), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    /* directory fsync unsupported — the rename is still atomic */
  }
}
