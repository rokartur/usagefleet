#!/usr/bin/env node
import { chmodSync, writeFileSync } from "node:fs";
import { COLLECTOR_VERSION, reportLimitsOnce, runOnce } from "./collector.js";
import { detectClaudeCreds } from "./claude-creds.js";
import { loadConfig, readFileConfig } from "./config.js";
import { sendNotification } from "./notify.js";
import { loadNotifyConfig } from "./notifier.js";
import { detectOs } from "./os.js";
import { defaultConfigPath } from "./paths.js";
import { loadState } from "./state.js";

function flag(name: string): string | undefined {
  const prefix = `--${name}`;
  const args = process.argv;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === prefix) {
      const next = args[i + 1];
      // don't swallow a following option as this flag's value
      return next !== undefined && !next.startsWith("--") ? next : undefined;
    }
    if (a.startsWith(prefix + "=")) return a.slice(prefix.length + 1);
  }
  return undefined;
}

function ts(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/** "5h 2% · weekly 13% · fable(7d) 24%" — the shared limits log line. */
function limitsSummary(limits: {
  fiveHourPct: number | null;
  sevenDayPct: number | null;
  modelLimits: Array<{ model: string; window: string; pct: number | null }>;
}): string {
  const models = limits.modelLimits
    .map((m) => ` · ${m.model}(${m.window}) ${m.pct ?? "?"}%`)
    .join("");
  return `5h ${limits.fiveHourPct ?? "?"}% · weekly ${limits.sevenDayPct ?? "?"}%${models}`;
}

async function cmdRun(): Promise<void> {
  const cfg = loadConfig();
  const r = await runOnce(cfg, (m) => console.log(`[${ts()}] ${m}`));
  console.log(
    `[${ts()}] scanned ${r.files} files · sent ${r.sent} · accepted ${r.accepted} · duplicates ${r.duplicates}${r.failed ? " · FAILED" : ""}`,
  );
  const limits = await reportLimitsOnce(cfg, (m) => console.log(`[${ts()}] ${m}`));
  if (limits) {
    console.log(`[${ts()}] limits (${limits.source}): ${limitsSummary(limits)}`);
  }
  if (r.failed) process.exitCode = 1;
}

async function cmdLimits(): Promise<void> {
  const cfg = loadConfig();
  const limits = await reportLimitsOnce(cfg, (m) => console.log(`[${ts()}] ${m}`));
  if (!limits) {
    process.exitCode = 1;
    return;
  }
  console.log(`[${ts()}] reported ${limits.source}: ${limitsSummary(limits)}`);
}

async function cmdWatch(): Promise<void> {
  const cfg = loadConfig();
  const raw = Number(flag("interval") ?? process.env.CLAUDE_TRACK_INTERVAL ?? 15);
  const interval = Math.max(1, Number.isFinite(raw) && raw > 0 ? raw : 15) * 1000;
  // The limits ping hits the real Messages API (1 billable token) — don't run it
  // every usage-scan tick. Report at most once per CLAUDE_TRACK_LIMITS_INTERVAL
  // seconds (default 300), decoupled from the much faster usage poll.
  const rawLimits = Number(process.env.CLAUDE_TRACK_LIMITS_INTERVAL ?? 300);
  const limitsInterval =
    Math.max(interval / 1000, Number.isFinite(rawLimits) && rawLimits > 0 ? rawLimits : 300) * 1000;
  let lastLimitsAt = 0;
  console.log(
    `[${ts()}] claude-track watching ${cfg.projectsDir}${cfg.desktopDir ? ` + ${cfg.desktopDir}` : ""}${cfg.piDir ? ` + ${cfg.piDir}` : ""} every ${interval / 1000}s → ${cfg.endpoint}`,
  );
  let stopping = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  const tick = async () => {
    if (stopping) return;
    running = true;
    try {
      const r = await runOnce(cfg, (m) => console.log(`[${ts()}] ${m}`));
      if (r.sent > 0) {
        console.log(`[${ts()}] sent ${r.sent} · accepted ${r.accepted} · dup ${r.duplicates}`);
      }
      const nowMs = Date.now();
      if (nowMs - lastLimitsAt >= limitsInterval) {
        lastLimitsAt = nowMs;
        const limits = await reportLimitsOnce(cfg, (m) => console.log(`[${ts()}] ${m}`));
        if (limits) {
          console.log(`[${ts()}] limits (${limits.source}): ${limitsSummary(limits)}`);
        }
      }
    } catch (err) {
      console.error(`[${ts()}] cycle error:`, (err as Error).message);
    } finally {
      running = false;
    }
    if (!stopping) timer = setTimeout(tick, interval);
  };
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      stopping = true;
      if (timer) clearTimeout(timer);
      console.log(`\n[${ts()}] stopping…`);
      // Let an in-flight cycle finish committing offsets; hard-exit fallback.
      const bail = setTimeout(() => process.exit(0), 5000);
      bail.unref();
      const wait = setInterval(() => {
        if (!running) {
          clearInterval(wait);
          process.exit(0);
        }
      }, 100);
      wait.unref();
    });
  }
  await tick();
}

function cmdNotifyTest(): void {
  const cfg = loadNotifyConfig();
  if (!cfg.enabled) {
    console.log("Notifications are disabled (CLAUDE_TRACK_NOTIFY=0).");
    return;
  }
  sendNotification(
    "claude-track",
    "Test notification — desktop alerts are working.",
    { urgency: "normal" },
  );
  console.log(
    `[${ts()}] sent a test notification via ${detectOs()} (thresholds: ${cfg.thresholds.join(", ")}%)`,
  );
}

function cmdStatus(): void {
  const cfg = loadConfig();
  const state = loadState(cfg.statePath);
  const tracked = Object.keys(state.files).length;
  const bytes = Object.values(state.files).reduce((a, f) => a + f.offset, 0);
  console.log(`os:        ${detectOs()}`);
  console.log(`endpoint:  ${cfg.endpoint}`);
  console.log(`token:     ${cfg.token.slice(0, 8)}…`);
  console.log(`projects:  ${cfg.projectsDir}`);
  console.log(`desktop:   ${cfg.desktopDir ?? "(disabled)"}`);
  console.log(`pi:        ${cfg.piDir ?? "(disabled)"}`);
  console.log(`deviceId:  ${state.deviceId}`);
  console.log(`tracked:   ${tracked} files, ${bytes} bytes consumed`);
  console.log(`updated:   ${state.updatedAt}`);
  const creds = detectClaudeCreds();
  console.log(
    `claude:    ${creds ? `${creds.source}${creds.subscriptionType ? ` (${creds.subscriptionType})` : ""} detected` : "no login detected"}`,
  );
}

function cmdInit(): void {
  const endpoint = flag("endpoint") ?? process.env.CLAUDE_TRACK_ENDPOINT;
  const token = flag("token") ?? process.env.CLAUDE_TRACK_TOKEN;
  if (!endpoint || !token) {
    console.error("Usage: claude-track init --endpoint <url> --token <device-token>");
    process.exit(1);
  }
  const path = defaultConfigPath();
  // Merge over any existing config so projectsDir etc. survive, and enforce
  // 0600 even when the file already existed (the mode option only applies on create).
  const merged = { ...readFileConfig(), endpoint, token };
  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    /* best-effort on platforms without POSIX perms */
  }
  console.log(`Wrote ${path}`);
}

function help(): void {
  console.log(`claude-track v${COLLECTOR_VERSION} — Claude usage collector

Usage:
  claude-track run                 Scan once, upload usage + report limits
  claude-track watch [--interval s] Poll continuously (default 15s)
  claude-track limits              Report only your real 5h/weekly limit usage
  claude-track notify-test         Fire a test desktop notification
  claude-track status              Show resolved config + state + Claude login
  claude-track init --endpoint <url> --token <t>   Write ~/.claude-track.json
  claude-track install             Install as a background service (launchd/systemd)
  claude-track uninstall           Remove the background service

Config (env overrides ~/.claude-track.json):
  CLAUDE_TRACK_ENDPOINT   server base URL (e.g. https://track.example.com)
  CLAUDE_TRACK_TOKEN      device token from the Devices page
  CLAUDE_TRACK_PROJECTS   override ~/.claude/projects (Claude Code)
  CLAUDE_TRACK_DESKTOP    override Claude Desktop sessions dir ("off" to disable)
  CLAUDE_TRACK_INTERVAL   watch interval seconds
  CLAUDE_TRACK_NOTIFY     desktop notifications on/off (default on; 0 to disable)
  CLAUDE_TRACK_NOTIFY_THRESHOLDS  comma list of % alerts (default 80,95)`);
}

async function main(): Promise<void> {
  // Log-and-continue for the long-running watch daemon: a stray rejection must
  // not silently kill the background service. One-shot commands still set a
  // non-zero exit via their own error paths.
  process.on("unhandledRejection", (reason) => {
    console.error(`[${ts()}] unhandledRejection:`, reason);
  });
  process.on("uncaughtException", (err) => {
    console.error(`[${ts()}] uncaughtException:`, (err as Error).message);
  });

  const cmd = process.argv[2] ?? "help";
  switch (cmd) {
    case "run":
      return cmdRun();
    case "watch":
      return cmdWatch();
    case "limits":
      return cmdLimits();
    case "notify-test":
      return cmdNotifyTest();
    case "status":
      return cmdStatus();
    case "init":
      return cmdInit();
    case "install": {
      const { install } = await import("./service.js");
      return install();
    }
    case "uninstall": {
      const { uninstall } = await import("./service.js");
      return uninstall();
    }
    default:
      return help();
  }
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
