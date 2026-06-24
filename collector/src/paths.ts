import { homedir } from "node:os";
import { join } from "node:path";

export function defaultProjectsDir(): string {
  return process.env.CLAUDE_TRACK_PROJECTS ?? join(homedir(), ".claude", "projects");
}

/** Claude Desktop's Electron userData dir, per-OS. Mirrors the app's own
 *  `app.getPath("userData")` (= platform appData + the "Claude" product name),
 *  verified against the installed app's main bundle. */
function claudeDesktopUserData(): string {
  if (process.platform === "win32") {
    const appData =
      process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "Claude");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Claude");
  }
  // linux + other unix: respect XDG_CONFIG_HOME, else ~/.config
  const xdg = process.env.XDG_CONFIG_HOME;
  return join(xdg && xdg.length > 0 ? xdg : join(homedir(), ".config"), "Claude");
}

/** Root under which Claude Desktop agent-mode (Cowork) sessions write their
 *  Claude-Code-format JSONL usage logs. The actual logs live deeper, under
 *  `<session>/.claude/projects/`; the collector filters to that subtree. */
export function defaultDesktopSessionsDir(): string {
  return join(claudeDesktopUserData(), "local-agent-mode-sessions");
}

export function defaultStatePath(): string {
  return process.env.CLAUDE_TRACK_STATE ?? join(homedir(), ".claude-track-state.json");
}

export function defaultConfigPath(): string {
  return process.env.CLAUDE_TRACK_CONFIG ?? join(homedir(), ".claude-track.json");
}

export function defaultNotifyStatePath(): string {
  return (
    process.env.CLAUDE_TRACK_NOTIFY_STATE ??
    join(homedir(), ".claude-track-notify.json")
  );
}
