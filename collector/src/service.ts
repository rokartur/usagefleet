import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const LABEL = "dev.claudetrack.collector";

// Env vars worth baking into the service so it behaves like the install shell.
const PASSTHROUGH_ENV = [
  "CLAUDE_TRACK_ENDPOINT",
  "CLAUDE_TRACK_TOKEN",
  "CLAUDE_TRACK_PROJECTS",
  "CLAUDE_TRACK_STATE",
  "CLAUDE_TRACK_CONFIG",
  "CLAUDE_TRACK_INTERVAL",
  "CLAUDE_TRACK_BATCH",
  "ANTHROPIC_API_KEY",
] as const;

/** Program + leading args to launch `watch`. Handles both `node dist/index.js`
 *  and a compiled single-file binary (where argv[1] is absent or == execPath). */
function programArgs(): string[] {
  const script = process.argv[1];
  if (!script || script === process.execPath) {
    return [process.execPath, "watch"]; // compiled binary
  }
  return [process.execPath, script, "watch"];
}

function macPlistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

function systemdUnitPath(): string {
  return join(homedir(), ".config", "systemd", "user", "claude-track.service");
}

/** Env vars that are actually set, for baking into the unit. */
function presentEnv(): Array<[string, string]> {
  return PASSTHROUGH_ENV.filter((k) => process.env[k]).map((k) => [
    k,
    process.env[k] as string,
  ]);
}

function xml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function install(): void {
  const prog = programArgs();
  const env = presentEnv();

  if (process.platform === "darwin") {
    const envXml = env
      .map(([k, v]) => `    <key>${xml(k)}</key><string>${xml(v)}</string>`)
      .join("\n");
    const progXml = prog.map((p) => `    <string>${xml(p)}</string>`).join("\n");
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${xml(LABEL)}</string>
  <key>ProgramArguments</key>
  <array>
${progXml}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${envXml}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardErrorPath</key><string>/tmp/claude-track.err.log</string>
  <key>StandardOutPath</key><string>/tmp/claude-track.out.log</string>
</dict>
</plist>
`;
    const path = macPlistPath();
    mkdirSync(join(homedir(), "Library", "LaunchAgents"), { recursive: true });
    writeFileSync(path, plist, "utf8");
    // execFile (no shell) so `path` is never subject to shell interpolation.
    try {
      execFileSync("launchctl", ["bootstrap", `gui/${process.getuid?.()}`, path], {
        stdio: "inherit",
      });
    } catch {
      try {
        execFileSync("launchctl", ["load", path], { stdio: "inherit" });
      } catch {
        /* report below; user can load manually */
      }
    }
    console.log(`Installed launchd agent at ${path}`);
    return;
  }

  if (process.platform === "linux") {
    // systemd: quote values, escape backslash/quote, reject newlines.
    const envLines = env
      .filter(([, v]) => !/[\r\n]/.test(v))
      .map(
        ([k, v]) => `Environment="${k}=${v.replace(/[\\"]/g, (m) => "\\" + m)}"`,
      )
      .join("\n");
    const unit = `[Unit]
Description=Claude Track collector
After=network-online.target

[Service]
ExecStart=${prog.join(" ")}
Restart=always
RestartSec=10
${envLines}

[Install]
WantedBy=default.target
`;
    const path = systemdUnitPath();
    mkdirSync(join(homedir(), ".config", "systemd", "user"), { recursive: true });
    writeFileSync(path, unit, "utf8");
    console.log(`Installed systemd unit at ${path}`);
    console.log("Enable it with:");
    console.log("  systemctl --user daemon-reload");
    console.log("  systemctl --user enable --now claude-track");
    console.log("  loginctl enable-linger $USER   # keep running after logout");
    return;
  }

  console.log("Windows: run as a service with NSSM, e.g.:");
  console.log(`  nssm install claude-track ${prog.map((p) => `"${p}"`).join(" ")}`);
  console.log("Or Task Scheduler (onlogon):");
  const tr = prog.map((p) => `\\"${p}\\"`).join(" ");
  console.log(`  schtasks /create /tn claude-track /sc onlogon /tr "${tr}"`);
}

export function uninstall(): void {
  if (process.platform === "darwin") {
    const path = macPlistPath();
    try {
      execFileSync("launchctl", ["bootout", `gui/${process.getuid?.()}`, path], {
        stdio: "inherit",
      });
    } catch {
      try {
        execFileSync("launchctl", ["unload", path], { stdio: "inherit" });
      } catch {
        /* ignore */
      }
    }
    console.log(`Removed launchd agent (delete ${path} to fully clean up).`);
    return;
  }
  if (process.platform === "linux") {
    try {
      execFileSync("systemctl", ["--user", "disable", "--now", "claude-track"], {
        stdio: "inherit",
      });
    } catch {
      /* ignore */
    }
    console.log(`Disabled systemd unit (delete ${systemdUnitPath()} to fully clean up).`);
    return;
  }
  console.log("Windows: nssm remove claude-track confirm  (or delete the scheduled task).");
}
