import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface ClaudeCreds {
  source: "sub" | "api";
  /** Subscription: OAuth access token (Bearer). API: the API key. */
  token: string;
  subscriptionType?: string | null;
}

interface OAuthBlob {
  claudeAiOauth?: {
    accessToken?: string;
    expiresAt?: number;
    subscriptionType?: string;
  };
}

/** Linux/Windows (and sometimes macOS): ~/.claude/.credentials.json */
function fromCredentialsFile(): OAuthBlob | null {
  try {
    return JSON.parse(
      readFileSync(join(homedir(), ".claude", ".credentials.json"), "utf8"),
    ) as OAuthBlob;
  } catch {
    return null;
  }
}

/** Set by the most recent fromMacKeychain() call so callers can distinguish a
 *  genuine "no login" from an access denial (common when the collector runs as a
 *  non-interactive launchd agent and the login Keychain read is refused). */
let macKeychainError: null | "notfound" | "denied" = null;

/** True if the last Keychain read failed for a reason other than item-not-found
 *  (exit 44) — i.e. the item likely exists but access was denied. */
export function macKeychainDenied(): boolean {
  return macKeychainError === "denied";
}

/** macOS: Claude Code stores the same JSON in the login Keychain. */
function fromMacKeychain(): OAuthBlob | null {
  if (process.platform !== "darwin") return null;
  macKeychainError = null;
  try {
    const out = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return JSON.parse(out) as OAuthBlob;
  } catch (err) {
    // `security` exits 44 (errSecItemNotFound) when there is genuinely no item;
    // any other non-zero status usually means the read was denied.
    const code = (err as { status?: number }).status;
    macKeychainError = code === 44 ? "notfound" : "denied";
    return null;
  }
}

/**
 * Auto-detect the local Claude login on THIS machine, with no manual entry:
 *   1. Subscription — OAuth from a `claude` (Claude Code) login.
 *   2. API key — ANTHROPIC_API_KEY env var.
 * Returns null if neither is present.
 */
export function detectClaudeCreds(): ClaudeCreds | null {
  const blob = fromCredentialsFile() ?? fromMacKeychain();
  const oauth = blob?.claudeAiOauth;
  // Only use the OAuth token if it isn't expired (60s skew margin); otherwise
  // fall through to the API key instead of pinging with a dead token.
  const exp = oauth?.expiresAt;
  const valid = exp == null || exp - 60_000 > Date.now();
  if (oauth?.accessToken && valid) {
    return {
      source: "sub",
      token: oauth.accessToken,
      subscriptionType: oauth.subscriptionType ?? null,
    };
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) return { source: "api", token: apiKey };
  return null;
}
