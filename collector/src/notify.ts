import { execFile } from "node:child_process";

export type Urgency = "low" | "normal" | "critical";

/** Collapse every whitespace run (including the raw newlines AppleScript string
 *  literals forbid) to a single space, leaving hyphens and other punctuation
 *  intact. */
function oneLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Escape a string for embedding inside an AppleScript double-quoted literal. */
function osaEscape(s: string): string {
  return oneLine(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Fire-and-forget child process; swallow spawn/runtime errors so a missing
 *  binary or denied display never disturbs the collector. */
function spawnQuiet(
  cmd: string,
  args: string[],
  onError?: (err: Error) => void,
): void {
  try {
    const child = execFile(cmd, args, { timeout: 5000 }, (err) => {
      if (err && onError) onError(err);
    });
    // Don't keep the event loop (or a one-shot `run`) alive waiting on the UI.
    child.unref?.();
  } catch (err) {
    onError?.(err as Error);
  }
}

function notifyMac(title: string, message: string): void {
  // execFile (no shell) — the only interpolation surface is the AppleScript
  // string, which osaEscape neutralizes.
  const script = `display notification "${osaEscape(message)}" with title "${osaEscape(title)}"`;
  spawnQuiet("osascript", ["-e", script]);
}

function notifyLinux(title: string, message: string, urgency: Urgency): void {
  // notify-send is the freedesktop standard; KDE Plasma's notification daemon
  // implements it. If it's absent (ENOENT) or fails, fall back to kdialog's
  // native passive popup (ships with KDE).
  spawnQuiet(
    "notify-send",
    // `--` ends option parsing so a title/message can never be read as a flag.
    ["-a", "claude-track", "-u", urgency, "--", oneLine(title), oneLine(message)],
    () => {
      spawnQuiet("kdialog", [
        "--title",
        oneLine(title),
        "--passivepopup",
        oneLine(message),
        "10",
      ]);
    },
  );
}

/**
 * Show a desktop notification. Best-effort and non-blocking: it never throws and
 * never blocks the caller. Supported platforms:
 *   - macOS: `osascript` -> Notification Center.
 *   - Linux: `notify-send` (KDE Plasma + other freedesktop daemons), falling
 *     back to `kdialog --passivepopup` on KDE.
 * Other platforms are a no-op.
 */
export function sendNotification(
  title: string,
  message: string,
  opts: { urgency?: Urgency } = {},
): void {
  try {
    if (process.platform === "darwin") {
      notifyMac(title, message);
    } else if (process.platform === "linux") {
      notifyLinux(title, message, opts.urgency ?? "normal");
    }
    // win32 and others: no built-in notifier wired up yet.
  } catch {
    /* notifications are non-essential — never let one break a cycle */
  }
}
