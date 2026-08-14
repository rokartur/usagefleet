import {
  closeSync,
  fsyncSync,
  openSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

/**
 * Durable atomic write: write to a per-process tmp file, fsync it, rename over
 * the target, then fsync the directory. The per-pid tmp name means two
 * concurrent collectors (e.g. the installed service + a manual `run`) can never
 * clobber a shared `.tmp` and publish corrupt content; the rename is atomic so a
 * reader never sees a half-written file, and the fsyncs make the result survive
 * a power loss.
 *
 * Used for every file the collector rewrites in place. Two of them belong to the
 * user rather than to us — `~/.claude/settings.json` and Claude's credentials —
 * where a torn write breaks their editor or logs them out, so a plain
 * writeFileSync is not good enough anywhere here.
 *
 * `mode` forces the result's permissions; omit it to inherit whatever the file
 * already had.
 */
export function writeFileAtomic(path: string, data: string, mode?: number): void {
  // Resolve a symlink to its target before writing. Dotfile setups routinely
  // link ~/.claude/settings.json into a repo, and renaming over the link would
  // replace it with a plain file and orphan the user's real config. Resolving
  // also keeps the tmp file on the target's filesystem, so the rename stays
  // atomic. Inheriting the current mode stops a hand-tightened 0600 from being
  // widened to the umask default on rewrite.
  let target = path;
  let fileMode = mode;
  try {
    const existing = statSync(path); // follows symlinks
    target = realpathSync(path);
    fileMode ??= existing.mode & 0o777;
  } catch {
    /* new or broken link — the caller's mode (or the umask default) applies */
  }

  const tmp = `${target}.${process.pid}.${randomUUID().slice(0, 8)}.tmp`;
  try {
    const fd = openSync(tmp, "w", fileMode);
    try {
      writeSync(fd, data, 0, "utf8");
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(tmp, target);
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
    const dirFd = openSync(dirname(target), "r");
    try {
      fsyncSync(dirFd);
    } finally {
      closeSync(dirFd);
    }
  } catch {
    /* directory fsync unsupported — the rename is still atomic */
  }
}
