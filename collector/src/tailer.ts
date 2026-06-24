import { closeSync, openSync, readSync, statSync } from "node:fs";
import { parseLine } from "./parser.js";
import type { FileState, UsageRecord, UsageSource } from "./types.js";

/** Max bytes read from a single file per cycle (bounds memory on huge backlogs). */
const MAX_READ = 16 * 1024 * 1024;

export interface TailResult {
  records: UsageRecord[];
  /** New offset to persist ONLY after the records are acknowledged by the server. */
  nextState: FileState;
  /** Bytes newly consumed (0 if nothing new). */
  consumedBytes: number;
}

/**
 * Read new, newline-terminated lines from `filePath` starting at the previously
 * stored offset. Handles rotation/truncation (inode change or size < offset →
 * restart from 0) and partial trailing lines (never consume past the last \n).
 */
export function tailFile(
  filePath: string,
  prev: FileState | undefined,
  source: UsageSource = "cli",
): TailResult | null {
  let st;
  try {
    st = statSync(filePath);
  } catch {
    return null; // file vanished
  }

  const rotated =
    prev !== undefined &&
    (st.ino !== prev.inode || st.size < prev.offset);
  const start = rotated || prev === undefined ? 0 : prev.offset;

  const base: FileState = {
    inode: Number(st.ino),
    dev: Number(st.dev),
    size: st.size,
    offset: start,
    mtimeMs: st.mtimeMs,
  };

  if (st.size <= start) {
    return { records: [], nextState: base, consumedBytes: 0 };
  }

  // Cap the per-cycle read so a huge backlog can't OOM; the next cycle resumes
  // from the committed offset.
  const length = Math.min(st.size - start, MAX_READ);
  const buf = Buffer.alloc(length);
  const fd = openSync(filePath, "r");
  try {
    readSync(fd, buf, 0, length, start);
  } finally {
    closeSync(fd);
  }

  // Only consume up to the last newline; keep any partial trailing line.
  const lastNl = buf.lastIndexOf(0x0a);
  if (lastNl < 0) {
    // No newline in a full MAX_READ window = one pathologically long line.
    // Skip past it so the file can't stall forever.
    if (length >= MAX_READ) {
      console.warn(
        `claude-track: skipping a line > ${MAX_READ} bytes in ${filePath} at offset ${start}`,
      );
      return {
        records: [],
        nextState: { ...base, offset: start + length },
        consumedBytes: length,
      };
    }
    return { records: [], nextState: base, consumedBytes: 0 };
  }
  const consumed = buf.subarray(0, lastNl + 1);
  const text = consumed.toString("utf8");

  const records: UsageRecord[] = [];
  for (const line of text.split("\n")) {
    const rec = parseLine(line, source);
    if (rec) records.push(rec);
  }

  const consumedBytes = consumed.length;
  return {
    records,
    nextState: { ...base, offset: start + consumedBytes },
    consumedBytes,
  };
}
