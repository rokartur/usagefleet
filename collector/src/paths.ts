import { homedir } from "node:os";
import { join } from "node:path";

export function defaultProjectsDir(): string {
  return process.env.CLAUDE_TRACK_PROJECTS ?? join(homedir(), ".claude", "projects");
}

export function defaultStatePath(): string {
  return process.env.CLAUDE_TRACK_STATE ?? join(homedir(), ".claude-track-state.json");
}

export function defaultConfigPath(): string {
  return process.env.CLAUDE_TRACK_CONFIG ?? join(homedir(), ".claude-track.json");
}
