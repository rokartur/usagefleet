# claude-track collector

Tails Claude Code's local JSONL logs and reports token usage to a Claude Track
server. Read-only on the log files. Zero runtime dependencies (Node ≥ 18).

## Install

```bash
cd collector
npm install
npm run build          # → dist/
npm link               # optional: exposes the `claude-track` command globally
```

## Configure

Get a device **token** from the server's Devices page, then either:

```bash
claude-track init --endpoint https://track.example.com --token ctk_xxx
# writes ~/.claude-track.json
```

or set env vars (they override the config file):

| Variable | Meaning |
|----------|---------|
| `CLAUDE_TRACK_ENDPOINT` | server base URL |
| `CLAUDE_TRACK_TOKEN` | device token |
| `CLAUDE_TRACK_PROJECTS` | override `~/.claude/projects` |
| `CLAUDE_TRACK_INTERVAL` | watch poll seconds (default 15) |
| `CLAUDE_TRACK_STATE` | override `~/.claude-track-state.json` |

### Setting the token per shell

**bash / zsh** (macOS, Linux) — one-off for the current session:

```bash
export CLAUDE_TRACK_ENDPOINT="https://track.example.com"
export CLAUDE_TRACK_TOKEN="ctk_xxx"
```

Persist it by appending those lines to `~/.bashrc` / `~/.zshrc`, then
`source ~/.zshrc`. Or set it inline for a single command:

```bash
CLAUDE_TRACK_ENDPOINT=https://track.example.com CLAUDE_TRACK_TOKEN=ctk_xxx claude-track run
```

**fish**:

```fish
set -x CLAUDE_TRACK_ENDPOINT "https://track.example.com"
set -x CLAUDE_TRACK_TOKEN "ctk_xxx"
# persist (writes to universal vars, survives restarts):
set -Ux CLAUDE_TRACK_TOKEN "ctk_xxx"
set -Ux CLAUDE_TRACK_ENDPOINT "https://track.example.com"
```

**PowerShell** (Windows) — current session:

```powershell
$env:CLAUDE_TRACK_ENDPOINT = "https://track.example.com"
$env:CLAUDE_TRACK_TOKEN = "ctk_xxx"
# persist for your user (new shells only):
setx CLAUDE_TRACK_TOKEN "ctk_xxx"
setx CLAUDE_TRACK_ENDPOINT "https://track.example.com"
```

**cmd.exe** (Windows):

```cmd
set CLAUDE_TRACK_ENDPOINT=https://track.example.com
set CLAUDE_TRACK_TOKEN=ctk_xxx
:: persist:  setx CLAUDE_TRACK_TOKEN "ctk_xxx"
```

> Prefer not to put a long-lived token in shell history/rc files? Use
> `claude-track init --endpoint <url> --token <t>` instead — it writes
> `~/.claude-track.json` (mode `600`), which the collector reads automatically.
> When run as a service, `claude-track install` bakes the current
> `CLAUDE_TRACK_*` env values into the launchd/systemd unit.

## Run

```bash
claude-track run            # one scan: upload usage + report limits
claude-track watch          # poll continuously
claude-track limits         # report ONLY your real 5h/weekly limit usage
claude-track status         # show config, tail state, and detected Claude login
```

The collector tracks a per-file byte offset in `~/.claude-track-state.json`, so
each line is sent once; it handles rotation/truncation and never sends a partial
line. Delivery is at-least-once — the server dedups on `uuid`.

### Real limit % (auto-detected)

On `run`/`watch`/`limits`, the collector reads your **local Claude login** on
this machine and reports your true utilization — no keys pasted anywhere:

1. **Subscription** — the OAuth token from `claude` (Claude Code). On macOS it's
   read from the login Keychain (`Claude Code-credentials`); on Linux/Windows from
   `~/.claude/.credentials.json`. Sign in once with `claude` and it's detected.
2. **API key** — falls back to `ANTHROPIC_API_KEY` if no subscription login.

It sends a 1-token ping to the Messages API and reads Anthropic's
`anthropic-ratelimit-unified-5h/7d-utilization` (and `-reset`) headers, then POSTs
the percentages to the server. `claude-track status` shows which login was found.
The token/credentials never leave your machine — only the resulting percentages
are uploaded.

## Run as a background service

```bash
claude-track install        # launchd (macOS) / systemd --user (Linux)
claude-track uninstall
```

- **macOS** — installs a LaunchAgent (`~/Library/LaunchAgents`, RunAtLoad +
  KeepAlive). Logs at `/tmp/claude-track.*.log`.
- **Linux** — writes a `--user` unit; then:
  `systemctl --user daemon-reload && systemctl --user enable --now claude-track`
  and `loginctl enable-linger $USER` to keep running after logout.
- **Windows** — `install` prints the NSSM / Task Scheduler command to register
  `claude-track watch` (the binary auto-detects the OS as `windows`).

The OS is reported automatically (`process.platform` → `mac`/`linux`/`windows`).
