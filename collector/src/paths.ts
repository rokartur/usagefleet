import { homedir } from "node:os";
import { join } from "node:path";

export function defaultProjectsDir(): string {
  return process.env.USAGEFLEET_PROJECTS ?? join(homedir(), ".claude", "projects");
}

/** Claude Desktop's Electron userData dir, per-OS. Mirrors the app's own
 *  `app.getPath("userData")` (= platform appData + the "Claude" product name),
 *  verified against the installed app's main bundle. */
function claudeDesktopUserData(): string {
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
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

/** Roots under which the pi coding agent writes its per-project session JSONLs
 *  (`<root>/<project>/<timestamp>_<uuid>.jsonl`). pi relocates them via
 *  PI_CODING_AGENT_SESSION_DIR / PI_CODING_AGENT_DIR — but those live in the
 *  user's shell, which a launchd/systemd service never inherits, so the default
 *  is every plausible root at once (missing ones scan to nothing). */
export function defaultPiSessionsDirs(): string[] {
  const dirs = [join(homedir(), ".pi", "agent", "sessions")];
  const session = process.env.PI_CODING_AGENT_SESSION_DIR;
  const agent = process.env.PI_CODING_AGENT_DIR;
  if (session) dirs.push(session);
  if (agent) dirs.push(join(agent, "sessions"));
  return [...new Set(dirs)];
}

/** Claude Code's user settings file, where the prompt guard hook is registered.
 *  CLAUDE_CONFIG_DIR is Claude Code's own relocation knob. */
export function claudeSettingsPath(): string {
  return join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "settings.json");
}

export function defaultStatePath(): string {
  return process.env.USAGEFLEET_STATE ?? join(homedir(), ".usagefleet-state.json");
}

export function defaultConfigPath(): string {
  return process.env.USAGEFLEET_CONFIG ?? join(homedir(), ".usagefleet.json");
}

export function defaultNotifyStatePath(): string {
  return process.env.USAGEFLEET_NOTIFY_STATE ?? join(homedir(), ".usagefleet-notify.json");
}
