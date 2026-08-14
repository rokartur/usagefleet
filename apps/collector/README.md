# usagefleet collector

Tails the local JSONL logs of Claude Code, Claude Desktop's agent-mode
(Cowork) sessions, **and** the [pi](https://github.com/badlogic/pi-mono) coding
agent (`~/.pi/agent/sessions`; only its Anthropic-provider records — usage via
other providers doesn't touch Claude limits), reporting token usage to a
UsageFleet server. Read-only on the log files. Zero runtime dependencies (Node ≥ 18).

## Install (recommended)

One line — downloads the prebuilt binary for your OS, verifies its checksum,
configures it, and enables autostart. You only need a device **token** from the
server's Devices page (endpoint defaults to `https://usagefleet.com`):

**macOS / Linux:**

```bash
curl -sSL https://usagefleet.com/install.sh | sh -s -- --token uf_xxx
```

**Windows (PowerShell):**

```powershell
$s = irm https://usagefleet.com/install.ps1
& ([scriptblock]::Create($s)) -Token uf_xxx
```

(Running `install.sh` from Git Bash/MSYS works too — it forwards your flags to
`install.ps1`.)

Step-by-step per OS — service paths, logs, update/uninstall, troubleshooting:
**[../INSTALL.md](../INSTALL.md)**.

The source repo is **private**, but you need no GitHub account: the server holds
the one credential and serves the binary itself. Autostart uses launchd (macOS),
systemd `--user` (Linux) and Task Scheduler (Windows).

**Update** any time by re-running the same command — it fetches the latest
binary and restarts the service. Flags: `--no-service` (binary only),
`--endpoint <url>` (self-hosted deployments), `--bin-dir <dir>`; `--help` for
all (PowerShell: `-NoService`, `-Endpoint`, `-BinDir`).

### Install from source

```bash
cd collector
npm install
npm run build          # → dist/
npm link               # optional: exposes the `usagefleet` command globally
```

## Configure

Get a device **token** from the server's Devices page, then either:

```bash
usagefleet init --endpoint https://track.example.com --token uf_xxx
# writes ~/.config/usagefleet/config.json
```

That one file (mode `600`) holds everything the CLI persists — your settings
plus the two machine-managed sections, `state` (per-log tail offsets) and
`notify` (which alert thresholds already fired). Delete it to start clean.
`XDG_CONFIG_HOME` is honoured. Installs predating the consolidation are folded
in automatically from `~/.usagefleet.json`, `~/.usagefleet-state.json` and
`~/.usagefleet-notify.json` on first write; those files are then unused and
safe to delete.

Or set env vars (they override the config file):

| Variable | Meaning |
|----------|---------|
| `USAGEFLEET_ENDPOINT` | server base URL. Must be `https://` (loopback may be `http://`): it carries the device token on every request, and self-update executes a binary fetched from it |
| `USAGEFLEET_TOKEN` | device token |
| `USAGEFLEET_PROJECTS` | override `~/.claude/projects` (Claude Code logs) |
| `USAGEFLEET_DESKTOP` | override the Claude Desktop agent-mode sessions dir (auto-detected per-OS); set `off`/`0` to skip desktop collection |
| `USAGEFLEET_PI` | override the pi agent sessions dirs, comma-separated (default `~/.pi/agent/sessions` plus whatever `PI_CODING_AGENT_DIR`/`PI_CODING_AGENT_SESSION_DIR` point at — a service inherits neither, so set this if you relocated pi's agent dir); set `off`/`0` to skip pi collection |
| `USAGEFLEET_INTERVAL` | watch poll seconds (default 15) |
| `USAGEFLEET_LIMITS_INTERVAL` | how often to ping for real 5h/weekly limits, seconds (default 300; decoupled from the faster usage poll so the 1-token ping doesn't run every cycle) |
| `USAGEFLEET_NOTIFY` | desktop notifications on/off (default **on**; set `0`/`false`/`off` to disable) |
| `USAGEFLEET_NOTIFY_THRESHOLDS` | comma list of utilization % that trigger an alert (default `80,95`) |
| `USAGEFLEET_BATCH` | records per upload request (default 100, capped at the server's limit of 1000) |
| `USAGEFLEET_CONFIG` | override the whole config file path (default `~/.config/usagefleet/config.json`) |
| `USAGEFLEET_UPDATE` | set `0` to turn the daily self-update check off |
| `USAGEFLEET_HOOK` | set `0` to keep the prompt-blocking hook out of `~/.claude/settings.json` |

### Setting the token per shell

**bash / zsh** (macOS, Linux) — one-off for the current session:

```bash
export USAGEFLEET_ENDPOINT="https://track.example.com"
export USAGEFLEET_TOKEN="uf_xxx"
```

Persist it by appending those lines to `~/.bashrc` / `~/.zshrc`, then
`source ~/.zshrc`. Or set it inline for a single command:

```bash
USAGEFLEET_ENDPOINT=https://track.example.com USAGEFLEET_TOKEN=uf_xxx usagefleet run
```

**fish**:

```fish
set -x USAGEFLEET_ENDPOINT "https://track.example.com"
set -x USAGEFLEET_TOKEN "uf_xxx"
# persist (writes to universal vars, survives restarts):
set -Ux USAGEFLEET_TOKEN "uf_xxx"
set -Ux USAGEFLEET_ENDPOINT "https://track.example.com"
```

**PowerShell** (Windows) — current session:

```powershell
$env:USAGEFLEET_ENDPOINT = "https://track.example.com"
$env:USAGEFLEET_TOKEN = "uf_xxx"
# persist for your user (new shells only):
setx USAGEFLEET_TOKEN "uf_xxx"
setx USAGEFLEET_ENDPOINT "https://track.example.com"
```

**cmd.exe** (Windows):

```cmd
set USAGEFLEET_ENDPOINT=https://track.example.com
set USAGEFLEET_TOKEN=uf_xxx
:: persist:  setx USAGEFLEET_TOKEN "uf_xxx"
```

> Prefer not to put a long-lived token in shell history/rc files? Use
> `usagefleet init --endpoint <url> --token <t>` instead — it writes
> `~/.config/usagefleet/config.json` (mode `600`), which the collector reads
> automatically. `init` merges, so re-running it rotates the token without
> resetting your tail offsets.
> When run as a service, `usagefleet install` bakes every `USAGEFLEET_*` value
> that is currently set (plus `ANTHROPIC_API_KEY`) into the launchd/systemd unit.
> The unit is written mode `600`, since it holds those secrets.

## Run

```bash
usagefleet run            # one scan: upload usage + report limits
usagefleet watch          # poll continuously
usagefleet limits         # report ONLY your real 5h/weekly limit usage
usagefleet guard          # exit 2 if this device's group is over a blocking limit
usagefleet update         # pull the latest release now
usagefleet status         # show config, tail state, and detected Claude login
```

### Updates

`watch` checks for a new release at startup and then once a day; when the tag
differs from the one baked into the binary it downloads the asset for this
OS/arch, **verifies its SHA-256**, swaps the binary and re-runs `install` to
restart the service. `usagefleet update` does the same on demand.

The binaries live in a private repo, so the download goes through your server
(`/api/v1/collector/latest` + `/api/v1/collector/download`, authenticated with
the device token) — the collector never needs `gh` or a GitHub token. The
server needs `GITHUB_TOKEN` set; without it the endpoints answer 503 and
collectors simply stay on their current version.

Every failure is a no-op: bad checksum, offline server, unknown platform,
locally-built (`dev`) binaries, a non-`https` endpoint, and script builds
(`node usagefleet.js`, where the running executable is your `node` rather than
the collector) all leave the install untouched. A swap that fails partway rolls
the previous binary back. Set `USAGEFLEET_UPDATE=0` to turn the daily check off.

The collector tracks a per-file byte offset in the config file's `state`
section, so each line is sent once; it handles rotation/truncation and never
sends a partial line. Delivery is at-least-once — the server dedups on `uuid`.

### Real limit % (auto-detected)

On `run`/`watch`/`limits`, the collector reads your **local Claude login** on
this machine and reports your true utilization — no keys pasted anywhere:

1. **Subscription** — the OAuth token from `claude` (Claude Code). On macOS it's
   read from the login Keychain (`Claude Code-credentials`); on Linux/Windows from
   `~/.claude/.credentials.json`. Sign in once with `claude` and it's detected.
2. **API key** — falls back to `ANTHROPIC_API_KEY` if no subscription login.

It sends a 1-token ping to the Messages API and reads Anthropic's
`anthropic-ratelimit-unified-5h/7d-utilization` (and `-reset`) headers, then POSTs
the percentages to the server. `usagefleet status` shows which login was found.
The token/credentials never leave your machine — only the resulting percentages
are uploaded.

### Blocking prompts over the limit

A group can be set to **refuse new prompts** once it has burned its budget slice
(1/group count of the account limit) for a window. Two switches per group, both
off by default — flip them in the database:

```sql
UPDATE groups SET block_on_session_limit = true WHERE name = 'Backend';  -- 5h window
UPDATE groups SET block_on_weekly_limit  = true WHERE name = 'Backend';  -- 7d window
```

Enforcement is a Claude Code `UserPromptSubmit` hook, registered in
`~/.claude/settings.json` automatically by `usagefleet install` (and removed
by `usagefleet uninstall`). Re-running install refreshes the path instead of
stacking a second hook; a settings file that doesn't parse is left untouched.
Set `USAGEFLEET_HOOK=0` to keep your settings file out of it and add the hook
yourself:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "usagefleet guard" }] }
    ]
  }
}
```

`usagefleet guard` asks the server whether the calling device's group is over
a window it blocks on; exit code 2 refuses the prompt and shows the reason.
It **fails open** everywhere else — no config, server down, timeout (5s), old
server, 429 — because a tracker problem must never stop you from working.
Only whole prompts are blocked, never tool calls mid-turn, so the current turn
always finishes.

### Desktop notifications

When the collector reads your real 5h/weekly utilization, it raises a **desktop
notification** the first time each window crosses a threshold (default `80%` and
`95%`). It fires at most once per threshold per window and re-arms when the
window resets, so it never spams.

```bash
usagefleet notify-test     # fire a sample notification to confirm it works
```

- **macOS** — uses `osascript` → Notification Center (no extra install).
- **Linux (KDE Plasma / freedesktop)** — uses `notify-send`; if that's missing it
  falls back to KDE's `kdialog --passivepopup`. Install `notify-send` via
  `libnotify` (e.g. `apt install libnotify-bin`) if neither is present.
- **Windows** — a WinRT toast via built-in `powershell.exe` → Action Center (no
  extra install; it appears under "Windows PowerShell"). Check Settings →
  Notifications if nothing shows up.

Tune or disable:

```bash
export USAGEFLEET_NOTIFY_THRESHOLDS="50,80,95"   # alert at 50/80/95%
export USAGEFLEET_NOTIFY=0                         # turn notifications off
```

> **Under a background service.** On macOS the LaunchAgent runs in your GUI
> session, so notifications appear normally. On Linux a `systemd --user` service
> needs access to your session bus (`DBUS_SESSION_BUS_ADDRESS`) for `notify-send`
> to reach the notification daemon — typical for `--user` units in a graphical
> login. `usagefleet install` bakes `USAGEFLEET_NOTIFY*` into the unit.

## Run as a background service

```bash
usagefleet install        # launchd (macOS) / systemd --user (Linux) / Task Scheduler (Windows)
usagefleet uninstall
```

`install` is idempotent and reload-safe: re-running it swaps in a new binary and
restarts the service, so it doubles as the update step.

- **macOS** — installs a LaunchAgent (`~/Library/LaunchAgents`, RunAtLoad +
  KeepAlive) and boots it (bootout → bootstrap → kickstart). Logs at
  `~/Library/Logs/usagefleet/usagefleet.*.log` (not `/tmp`, which is
  world-writable). The plist is written mode `600`: it holds your token.
- **Linux** — writes a `--user` unit and runs `systemctl --user daemon-reload`,
  `enable --now`, `restart`, plus `loginctl enable-linger $USER` automatically so
  it survives logout. If `systemctl` can't be driven, it prints the manual steps.
- **Windows** — registers a Scheduled Task (`usagefleet`) that starts at logon,
  restarts on failure, and runs **hidden** (no console window) through a
  generated `wscript` launcher in `%LOCALAPPDATA%\usagefleet`. Task XML has no
  env support, so the launcher carries the `USAGEFLEET_*` values that were set
  when you ran `install`, and redirects output to
  `%LOCALAPPDATA%\usagefleet\usagefleet.log` (truncated on each start).
  Inspect it with `schtasks /query /tn usagefleet /v /fo list`.

The OS is reported automatically (`process.platform` → `mac`/`linux`/`windows`).

> **macOS limits under the service.** Usage collection (reading JSONL files) works
> headless. The **real limit %** feature reads the login Keychain, and a
> non-interactive launchd agent may be denied that read — the collector logs a
> clear hint when this happens. If it does, either approve `/usr/bin/security`
> access to the `Claude Code-credentials` item once, or set `ANTHROPIC_API_KEY`
> before `usagefleet install` (it's baked into the service) so limits use the
> API key instead. A compiled binary is copied to a stable per-user location at
> install time, so you can move or delete the downloaded file afterward.
