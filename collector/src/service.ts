import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileConfig } from "./config.js";

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

/** Stable per-user dir where a compiled binary is copied so the service doesn't
 *  break if the user moves/deletes the originally-downloaded file. */
function stableBinDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "claude-track");
  }
  return join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "claude-track",
  );
}

function stableBinPath(): string {
  return join(stableBinDir(), process.platform === "win32" ? "claude-track.exe" : "claude-track");
}

/** Program + leading args to launch `watch`. Handles both `node dist/index.js`
 *  and a compiled single-file binary (where argv[1] is absent or == execPath).
 *  For the compiled binary, copy it to a stable location and point the service
 *  there — the downloaded file is often a transient ~/Downloads path. */
function programArgs(): string[] {
  const script = process.argv[1];
  const isBinary = !script || script === process.execPath;
  if (!isBinary) {
    // `node dist/index.js` (e.g. npm link) — the script path is already stable.
    return [process.execPath, script, "watch"];
  }
  try {
    const dest = stableBinPath();
    if (dest !== process.execPath) {
      mkdirSync(stableBinDir(), { recursive: true });
      copyFileSync(process.execPath, dest);
      try {
        chmodSync(dest, 0o755);
      } catch {
        /* non-POSIX fs */
      }
    }
    return [dest, "watch"];
  } catch (err) {
    console.warn(
      `Could not copy the binary to a stable path (${(err as Error).message}). ` +
        `The service will be pinned to ${process.execPath} — do not move or delete it, ` +
        `or re-run \`claude-track install\` from its new location.`,
    );
    return [process.execPath, "watch"];
  }
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
  // Pre-flight: refuse to install a service that can't resolve an endpoint+token,
  // otherwise the baked `watch` process throws on every launch and the service
  // manager crash-loops it invisibly (only /tmp logs show it). Use the same
  // env-OR-file precedence loadConfig() uses so a prior `init` is honored.
  const file = readFileConfig();
  const endpoint = process.env.CLAUDE_TRACK_ENDPOINT || file.endpoint || "";
  const token = process.env.CLAUDE_TRACK_TOKEN || file.token || "";
  if (!endpoint || !token) {
    console.error(
      "No endpoint/token resolved. Run `claude-track init --endpoint <url> --token <t>` " +
        "(or set CLAUDE_TRACK_ENDPOINT and CLAUDE_TRACK_TOKEN) before installing.",
    );
    process.exit(1);
  }

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
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key><false/>
  </dict>
  <key>ThrottleInterval</key><integer>30</integer>
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
Wants=network-online.target
After=network-online.target
# Cap respawns so a misconfigured unit can't loop forever.
StartLimitIntervalSec=120
StartLimitBurst=5

[Service]
ExecStart=${prog.join(" ")}
Restart=always
RestartSec=30
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
  if (env.length > 0) {
    console.log("Then give the service its config (env is not inherited by NSSM):");
    for (const [k, v] of env) {
      const shown = k === "CLAUDE_TRACK_TOKEN" || k === "ANTHROPIC_API_KEY" ? "<value>" : v;
      console.log(`  nssm set claude-track AppEnvironmentExtra ${k}=${shown}`);
    }
    console.log("  (or run `claude-track init` so the config file carries the secrets instead)");
  }
  console.log("Or Task Scheduler (onlogon):");
  const tr = prog.map((p) => `\\"${p}\\"`).join(" ");
  console.log(`  schtasks /create /tn claude-track /sc onlogon /tr "${tr}"`);
}

/** Best-effort removal of the stable binary copy made at install time. */
function removeStableBin(): void {
  try {
    rmSync(stableBinPath(), { force: true });
  } catch {
    /* ignore */
  }
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
    removeStableBin();
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
    removeStableBin();
    console.log(`Disabled systemd unit (delete ${systemdUnitPath()} to fully clean up).`);
    return;
  }
  console.log("Windows: nssm remove claude-track confirm  (or delete the scheduled task).");
}
