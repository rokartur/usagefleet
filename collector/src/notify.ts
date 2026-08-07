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

/** Escape a string for a PowerShell single-quoted literal (no interpolation
 *  happens inside one, so doubling `'` is the whole job). */
function psEscape(s: string): string {
  return oneLine(s).replace(/'/g, "''");
}

function notifyWindows(title: string, message: string): void {
  // WinRT toast through Windows PowerShell 5.1 (always present on Win10/11;
  // pwsh 7 can't load WinRT types). Text goes in via the DOM, so there is no
  // XML-injection surface. Borrowing PowerShell's AppUserModelID avoids having
  // to register one of our own — the toast shows up under "Windows PowerShell".
  const script = [
    "[Windows.UI.Notifications.ToastNotificationManager,Windows.UI.Notifications,ContentType=WindowsRuntime]|Out-Null",
    "$t=[Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)",
    "$n=$t.GetElementsByTagName('text')",
    `$n.Item(0).AppendChild($t.CreateTextNode('${psEscape(title)}'))|Out-Null`,
    `$n.Item(1).AppendChild($t.CreateTextNode('${psEscape(message)}'))|Out-Null`,
    "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('Microsoft.WindowsPowerShell').Show([Windows.UI.Notifications.ToastNotification]::new($t))",
  ].join(";");
  spawnQuiet("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
}

/**
 * Show a desktop notification. Best-effort and non-blocking: it never throws and
 * never blocks the caller. Supported platforms:
 *   - macOS: `osascript` -> Notification Center.
 *   - Linux: `notify-send` (KDE Plasma + other freedesktop daemons), falling
 *     back to `kdialog --passivepopup` on KDE.
 *   - Windows: WinRT toast via `powershell.exe` -> Action Center.
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
    } else if (process.platform === "win32") {
      notifyWindows(title, message);
    }
  } catch {
    /* notifications are non-essential — never let one break a cycle */
  }
}
