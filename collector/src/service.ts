import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { readFileConfig } from "./config.js";

const LABEL = "dev.claudetrack.collector";
/** Scheduled Task name on Windows (mirrors the launchd label / systemd unit). */
const TASK = "claude-track";

// Env vars worth baking into the service so it behaves like the install shell.
const PASSTHROUGH_ENV = [
  "CLAUDE_TRACK_ENDPOINT",
  "CLAUDE_TRACK_TOKEN",
  "CLAUDE_TRACK_PROJECTS",
  "CLAUDE_TRACK_STATE",
  "CLAUDE_TRACK_CONFIG",
  "CLAUDE_TRACK_INTERVAL",
  "CLAUDE_TRACK_BATCH",
  "CLAUDE_TRACK_NOTIFY",
  "CLAUDE_TRACK_NOTIFY_THRESHOLDS",
  "CLAUDE_TRACK_NOTIFY_STATE",
  "ANTHROPIC_API_KEY",
] as const;

/** Stable per-user dir where a compiled binary is copied so the service doesn't
 *  break if the user moves/deletes the originally-downloaded file. */
function stableBinDir(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "claude-track");
  }
  if (process.platform === "win32") {
    return join(
      process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"),
      "claude-track",
    );
  }
  return join(
    process.env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
    "claude-track",
  );
}

/** Where the Windows launcher sends the collector's stdout/stderr (launchd has
 *  /tmp logs, systemd has the journal — a hidden task has nowhere else to go). */
function windowsLogPath(): string {
  return join(stableBinDir(), "claude-track.log");
}

function windowsVbsPath(): string {
  return join(stableBinDir(), "claude-track-watch.vbs");
}

function stableBinPath(): string {
  return join(stableBinDir(), process.platform === "win32" ? "claude-track.exe" : "claude-track");
}

/** True when running as a compiled single-file executable rather than
 *  `node dist/index.js`. A bun `--compile` binary has no real re-invokable
 *  script at argv[1]: it's absent, equals the exec path, or points into bun's
 *  virtual bundle filesystem (`/$bunfs/…` on POSIX, `…~BUN\…` on Windows).
 *  Treating that virtual path as a real script (the old bug) baked a bogus
 *  argument into the service command, so the launched process saw an unknown
 *  command, printed help, and exited cleanly — leaving the service down. */
export function looksLikeCompiledBinary(
  scriptPath: string | undefined,
  execPath: string,
): boolean {
  if (!scriptPath || scriptPath === execPath) return true;
  if (scriptPath.includes("/$bunfs/")) return true;
  if (/[\\/]~BUN[\\/]/.test(scriptPath)) return true;
  return false;
}

/** Program + leading args to launch `watch`. Handles both `node dist/index.js`
 *  and a compiled single-file binary. For the compiled binary, copy it to a
 *  stable location and point the service there — the downloaded file is often a
 *  transient ~/Downloads path. */
function programArgs(): string[] {
  const script = process.argv[1];
  if (!looksLikeCompiledBinary(script, process.execPath)) {
    // `node dist/index.js` (e.g. npm link) — the script path is already stable.
    return [process.execPath, script as string, "watch"];
  }
  try {
    const dest = stableBinPath();
    if (dest !== process.execPath) {
      mkdirSync(stableBinDir(), { recursive: true });
      try {
        copyFileSync(process.execPath, dest);
      } catch {
        // Windows locks a running .exe against overwrite, but renaming it aside
        // is allowed — that's how an update swaps the binary under a live task.
        const old = `${dest}.old`;
        rmSync(old, { force: true });
        renameSync(dest, old);
        copyFileSync(process.execPath, dest);
      }
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

/** Escape a string for a VBScript double-quoted literal (only `"` is special). */
function vbs(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

/** Hidden launcher for the Scheduled Task. A bun-compiled collector is a console
 *  app, so running it straight from Task Scheduler pops a console window that
 *  stays up for the whole session; wscript.exe is windowless and starts the
 *  collector with window style 0. It also carries the CLAUDE_TRACK_* env the way
 *  the plist/unit does (Task XML has no env support) and redirects output to a
 *  log file, since a hidden process has no console to print to.
 *  Waits (`True`) so the task instance lives as long as the collector — that's
 *  what makes RestartOnFailure in the task XML meaningful. */
export function windowsLauncherVbs(
  prog: string[],
  env: Array<[string, string]>,
  logPath: string,
): string {
  const quoted = prog.map((p) => `"${p}"`).join(" ");
  // `cmd /c ""prog" args > "log""` is cmd's canonical form for quoted paths.
  const cmdLine = `cmd /c "${quoted} > "${logPath}" 2>&1"`;
  const envLines = env
    // A newline would end the VBS statement; such a value can't be represented.
    .filter(([, v]) => !/[\r\n]/.test(v))
    .map(([k, v]) => `env(${vbs(k)}) = ${vbs(v)}`);
  return [
    "' claude-track background launcher — generated by `claude-track install`.",
    'Set sh = CreateObject("WScript.Shell")',
    'Set env = sh.Environment("Process")',
    ...envLines,
    `sh.Run ${vbs(cmdLine)}, 0, True`,
    "",
  ].join("\r\n");
}

/** Scheduled Task definition: run at logon, restart on failure, no time limit —
 *  the Windows equivalent of RunAtLoad+KeepAlive / Restart=always.
 *  <Settings> children follow the order Windows itself exports; the schema is a
 *  strict sequence and rejects the whole file if they're shuffled. */
export function windowsTaskXml(vbsPath: string, userId: string): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Claude Track collector</Description>
  </RegistrationInfo>
  <Triggers>
    <LogonTrigger>
      <Enabled>true</Enabled>
      <UserId>${xml(userId)}</UserId>
    </LogonTrigger>
  </Triggers>
  <Principals>
    <Principal id="Author">
      <UserId>${xml(userId)}</UserId>
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>LeastPrivilege</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>true</AllowHardTerminate>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>7</Priority>
    <RestartOnFailure>
      <Interval>PT1M</Interval>
      <Count>3</Count>
    </RestartOnFailure>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>//B //Nologo "${xml(vbsPath)}"</Arguments>
    </Exec>
  </Actions>
</Task>
`;
}

/** Current user as DOMAIN\user (or just user), for the task's principal. */
function windowsUserId(): string {
  const user = process.env.USERNAME || process.env.USER || "";
  const domain = process.env.USERDOMAIN;
  return domain ? `${domain}\\${user}` : user;
}

function schtasks(...args: string[]): boolean {
  try {
    execFileSync("schtasks", args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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

  // Windows: stop a running task first, otherwise the live .exe blocks the
  // stable-copy overwrite and `schtasks /run` below would be ignored (the task
  // is IgnoreNew) — leaving the OLD binary resident after an "update".
  if (process.platform === "win32") schtasks("/end", "/tn", TASK);

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
    const domain = `gui/${process.getuid?.()}`;
    // execFile (no shell) so `path` is never subject to shell interpolation.
    // Reload-safe: boot out any previous instance first so re-running install
    // (e.g. to apply an update) swaps in the new binary instead of leaving the
    // old one resident.
    try {
      execFileSync("launchctl", ["bootout", domain, path], { stdio: "ignore" });
    } catch {
      /* not loaded yet — fine */
    }
    try {
      execFileSync("launchctl", ["bootstrap", domain, path], { stdio: "inherit" });
    } catch {
      try {
        execFileSync("launchctl", ["load", path], { stdio: "inherit" });
      } catch {
        /* report below; user can load manually */
      }
    }
    // Force a (re)start so an update takes effect immediately, not on next respawn.
    try {
      execFileSync("launchctl", ["kickstart", "-k", `${domain}/${LABEL}`], {
        stdio: "ignore",
      });
    } catch {
      /* best-effort */
    }
    console.log(`Installed launchd agent at ${path} (autostart enabled).`);
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
    // Enable + start automatically so autostart "just works". `restart` after
    // enable picks up a new binary when re-running install to apply an update
    // (enable --now leaves an already-running unit untouched).
    const sc = (...args: string[]): boolean => {
      try {
        execFileSync("systemctl", ["--user", ...args], { stdio: "inherit" });
        return true;
      } catch {
        return false;
      }
    };
    const reloaded = sc("daemon-reload");
    // Clear any prior failure / start-limit lockout so a re-install (e.g. to
    // recover a unit that crash-looped on an older buggy binary) isn't rejected
    // with "start request repeated too quickly". No-op on a healthy unit.
    sc("reset-failed", "claude-track");
    const enabled = sc("enable", "--now", "claude-track");
    if (reloaded && enabled) {
      sc("restart", "claude-track");
      // Keep the user manager (and thus the service) alive after logout.
      const user = process.env.USER || process.env.LOGNAME;
      if (user) {
        try {
          execFileSync("loginctl", ["enable-linger", user], { stdio: "ignore" });
        } catch {
          /* not critical; service still runs while logged in */
        }
      }
      console.log("Enabled and started claude-track (autostart on login).");
    } else {
      console.log("Could not drive systemctl automatically. Enable it manually:");
      console.log("  systemctl --user daemon-reload");
      console.log("  systemctl --user enable --now claude-track");
      console.log("  loginctl enable-linger $USER   # keep running after logout");
    }
    return;
  }

  if (process.platform === "win32") {
    const vbsPath = windowsVbsPath();
    mkdirSync(stableBinDir(), { recursive: true });
    writeFileSync(vbsPath, windowsLauncherVbs(prog, env, windowsLogPath()), "utf8");

    // schtasks reads task XML as UTF-16 (a UTF-8 file is rejected as malformed).
    const xmlPath = join(tmpdir(), `claude-track-task-${process.pid}.xml`);
    writeFileSync(xmlPath, "\ufeff" + windowsTaskXml(vbsPath, windowsUserId()), "utf16le");
    // /f replaces any previous definition, so install doubles as the updater.
    const created =
      schtasks("/create", "/tn", TASK, "/xml", xmlPath, "/f") ||
      // Fallback for hosts that reject the XML (locale/schema quirks): a plain
      // onlogon task. Same launcher, minus restart-on-failure.
      schtasks(
        "/create", "/tn", TASK, "/sc", "onlogon", "/f",
        "/tr", `wscript.exe //B //Nologo "${vbsPath}"`,
      );
    rmSync(xmlPath, { force: true });

    if (!created) {
      console.error(
        "Could not register the scheduled task. Register it manually:\n" +
          `  schtasks /create /tn ${TASK} /sc onlogon /tr "wscript.exe //B //Nologo \\"${vbsPath}\\""`,
      );
      process.exit(1);
    }
    // Start now so install/update takes effect immediately, not at next logon.
    schtasks("/run", "/tn", TASK);
    console.log(`Installed scheduled task "${TASK}" (autostart at logon, runs hidden).`);
    console.log(`Logs: ${windowsLogPath()}`);
    return;
  }

  console.log(`Unsupported platform for service install: ${process.platform}.`);
  console.log(`Run it yourself with: ${prog.join(" ")}`);
}

/** Best-effort removal of the stable binary copy made at install time (plus the
 *  `.old` file a Windows in-place update may have left behind). */
function removeStableBin(): void {
  for (const p of [stableBinPath(), `${stableBinPath()}.old`]) {
    try {
      rmSync(p, { force: true });
    } catch {
      /* ignore */
    }
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
  if (process.platform === "win32") {
    schtasks("/end", "/tn", TASK);
    const deleted = schtasks("/delete", "/tn", TASK, "/f");
    try {
      rmSync(windowsVbsPath(), { force: true });
    } catch {
      /* ignore */
    }
    removeStableBin();
    console.log(
      deleted ? `Removed scheduled task "${TASK}".` : `No scheduled task "${TASK}" found.`,
    );
    return;
  }
  console.log(`Nothing to uninstall on ${process.platform}.`);
}
