import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { claudeSettingsPath } from "./paths.js";

/** Outer bound on the hook, in seconds. runGuard's own fetch gives up after 5s
 *  and fails open; this only matters if the process itself wedges. */
const HOOK_TIMEOUT_S = 10;

/** Recognises a guard hook we installed (at any binary path, from any version)
 *  so install is idempotent and uninstall is precise. */
const GUARD_COMMAND = /claude-track.*\bguard\b/;

interface HookCommand {
  type?: string;
  command?: string;
  timeout?: number;
}
interface HookGroup {
  matcher?: string;
  hooks?: HookCommand[];
}
/** Only the shape we touch; everything else in the user's settings is opaque
 *  and must survive a round-trip untouched. */
interface ClaudeSettings {
  hooks?: Record<string, HookGroup[]>;
  [key: string]: unknown;
}

/** `/path/to/claude-track guard`, quoted for the shell Claude Code runs it in. */
export function guardCommand(program: string[]): string {
  return program.map((p) => (p.includes(" ") ? `"${p}"` : p)).join(" ");
}

/** Drop every guard hook we ever installed, leaving the rest of the file alone. */
export function withoutGuardHook(settings: ClaudeSettings): ClaudeSettings {
  const groups = settings.hooks?.UserPromptSubmit;
  if (!groups) return settings;
  const kept = groups
    .map((g) => ({
      ...g,
      hooks: (g.hooks ?? []).filter((h) => !GUARD_COMMAND.test(h.command ?? "")),
    }))
    .filter((g) => g.hooks.length > 0);
  const hooks = { ...settings.hooks };
  if (kept.length > 0) hooks.UserPromptSubmit = kept;
  else delete hooks.UserPromptSubmit;
  return { ...settings, hooks: Object.keys(hooks).length > 0 ? hooks : undefined };
}

/** Strip-then-append, so re-running install refreshes a stale binary path
 *  instead of stacking a second hook. */
export function withGuardHook(settings: ClaudeSettings, command: string): ClaudeSettings {
  const base = withoutGuardHook(settings);
  const groups = base.hooks?.UserPromptSubmit ?? [];
  return {
    ...base,
    hooks: {
      ...base.hooks,
      UserPromptSubmit: [
        ...groups,
        { hooks: [{ type: "command", command, timeout: HOOK_TIMEOUT_S }] },
      ],
    },
  };
}

/** Read → transform → write ~/.claude/settings.json, skipping the write when
 *  nothing changed. Refuses to touch a file it cannot parse: a hand-edited
 *  settings file is worth more than this hook. */
function editSettings(
  transform: (s: ClaudeSettings) => ClaudeSettings,
  onWrite: (path: string) => void,
): void {
  const path = claudeSettingsPath();
  let raw = "";
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    /* no settings file yet */
  }

  let settings: ClaudeSettings = {};
  if (raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
      settings = parsed as ClaudeSettings;
    } catch {
      console.warn(`Could not parse ${path} — left it untouched. Fix the JSON and re-run.`);
      return;
    }
  }

  const next = transform(settings);
  if (JSON.stringify(next) === JSON.stringify(settings)) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(next, null, 2) + "\n", "utf8");
  onWrite(path);
}

/**
 * Register `claude-track guard` as a Claude Code UserPromptSubmit hook, so a
 * group with blocking enabled actually refuses prompts. Called by
 * `claude-track install`; set CLAUDE_TRACK_HOOK=0 to keep settings.json
 * untouched.
 */
export function installPromptHook(program: string[]): void {
  if (process.env.CLAUDE_TRACK_HOOK === "0") return;
  const command = guardCommand(program);
  editSettings(
    (s) => withGuardHook(s, command),
    (path) => console.log(`Registered the over-limit prompt guard in ${path}.`),
  );
}

export function uninstallPromptHook(): void {
  editSettings(withoutGuardHook, (path) => console.log(`Removed the prompt guard from ${path}.`));
}
