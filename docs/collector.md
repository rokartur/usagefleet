# Collector internals

`apps/cli` — `@usagefleet/cli`. Zero runtime dependencies, Node ≥ 20, one
process per machine. User-facing usage lives in
[`apps/cli/README.md`](../apps/cli/README.md); this is how it works inside.

## Commands

`index.ts` dispatches: `init`/`install` (interactive setup + autostart),
`run` (one cycle), `watch` (the daemon loop), `limits` (one limits report),
`guard` (the prompt hook), `status`, `config` (file path + env reference),
`update`, `notify-test`, `uninstall`, `completion` (zsh/fish scripts).

The command list itself lives in `completion.ts` and drives both `help` and the
generated completion scripts — add a command there, not in two places. Two
entrypoints are deliberately missing from it, so they dispatch without being
advertised: `watch`, which is what the installed service runs rather than
something to type, and `--version`/`-v`, since bare `usagefleet` already prints
the release in its header.

`install` also writes the completion scripts to where each shell loads them
(`installCompletions`), appending an `fpath` block to `.zshrc` when zsh needs
one. It runs after the service so a completion failure can never fail the
install, and self-update re-runs `install`, which keeps completions in step with
new commands.

## The watch loop

Every `USAGEFLEET_INTERVAL` seconds (default 15) `runOnce()`:

1. `scanner.ts` lists `*.jsonl` under the watched roots — `~/.claude/projects`,
   Claude Desktop's Electron userData sessions, and any Pi session dirs. Only
   files inside a `.../.claude/projects/...` subtree count as usage logs; the
   desktop root also holds `audit.jsonl`, a full duplicate of the same uuids.
2. `tailer.ts` reads each file from its stored byte offset (≤16 MB per file per
   cycle), `parser.ts` turns lines into `UsageRecord`s.
3. `uploader.ts` posts them in batches of ≤1000 (the server's `BatchSchema` cap)
   with retry + backoff.
4. The new offset is committed **only after** the server acknowledges — hence
   at-least-once delivery and the server-side dedup on `(userId, uuid)`.
5. Offsets for files that no longer exist are pruned, so a long-lived install
   doesn't grow one state entry per session forever.

A `400`/`422` means the server parsed the request and rejected the *records*, so
the chunk is split and each half retried: one malformed line costs one record
instead of the whole batch. `402` parks the device (plan wall) without losing
data; uploads resume when a slot frees up.

On the same loop, less often: the limits report every
`USAGEFLEET_LIMITS_INTERVAL` seconds (default 300) and a self-update check every
`USAGEFLEET_UPDATE_INTERVAL` seconds (default 6h).

## Limits reporting

`claude-creds.ts` finds the local Claude login — subscription OAuth (macOS
Keychain or `~/.claude/.credentials.json`, refreshing an expired token) or an
API key — and `claude-limits.ts` sends a **1-token** request to
`api.anthropic.com/v1/messages` purely to read the response headers:
`anthropic-ratelimit-unified-{5h,7d}-*` plus per-model variants like
`...-7d-fable-utilization`. That is why the limits ping is rate-limited
separately from the usage scan: every one costs a billable token.

For a subscription login there is a **second** source: `api/oauth/usage` on the
same host, the undocumented endpoint Claude Code's own `/usage` uses. The
Messages headers only carry the account-wide 5h/7d windows, so the per-model
caps ("Fable · 24% used") come from here. It is a separate request and so a
separate failure point — a non-OK response or an unexpected shape yields no
model limits while the 5h/7d figures still report normally. Its values are
already 0–100 percentages, unlike the header fractions.

The parsed report goes to `POST /api/v1/limits`. Percentages are clamped to
0–100 and accept both the `37` and `0.37` header forms.

`notifier.ts` compares each window's utilization against ascending thresholds
(`USAGEFLEET_NOTIFY_THRESHOLDS`, default 80/95) and fires one desktop
notification per threshold per window via `notify.ts` (osascript / notify-send /
PowerShell toast). The per-window marks live in the store, so a new window
re-arms them.

## Prompt guard

`usagefleet guard` is a Claude Code `UserPromptSubmit` hook, installed into
`~/.claude/settings.json` by `hook.ts`. It asks
`GET /api/v1/limits`; exit 2 refuses the prompt with the stderr message, exit 0
lets it through. Nothing is printed on stdout — on this hook stdout is injected
into the model's context.

It **fails open** by design: unconfigured, offline, timed out (5s), non-OK
response, junk JSON, or a server too old to send the fields all return 0. Only an
explicit `blocked: true` blocks. A tracker outage must never stop someone from
working.

The server fails open too: it only answers `blocked: true` while the account's
last reported utilization is under 15 minutes old. Limits reporting needs live
Claude credentials and can stop while usage upload keeps working, so without
that window a frozen percentage would refuse prompts indefinitely. Raising
`USAGEFLEET_LIMITS_INTERVAL` past 15 min therefore turns blocking off.

## State and config

One file: `~/.config/usagefleet/config.json` (`XDG_CONFIG_HOME` honoured,
`USAGEFLEET_CONFIG` overrides the path) holding settings, tail offsets and
notification marks. Every write goes through `atomic-write.ts` — tmp file →
fsync → rename → fsync dir, with a per-pid tmp name so a manual `run` alongside
the installed service can't publish a corrupt half-write.

Env overrides everything in the file: `USAGEFLEET_TOKEN`, `_ENDPOINT`,
`_PROJECTS`, `_DESKTOP`, `_PI`, `_BATCH`, `_INTERVAL`, `_LIMITS_INTERVAL`,
`_UPDATE`, `_UPDATE_INTERVAL`, `_NOTIFY`, `_NOTIFY_THRESHOLDS`, `_HOOK`.

## Autostart (`service.ts`)

User-scoped on every OS, never root: launchd `LaunchAgents` plist (macOS),
systemd `--user` unit (Linux), Scheduled Task at logon driven by a hidden VBS
launcher (Windows, because a compiled console binary would flash a window).
Installs resolve the binary through a stable bin dir, since the service starts
with a nearly empty PATH. `uninstall` removes the agent/unit/task and the guard
hook.

## Self-update

`update.ts` runs `npm i -g @usagefleet/cli` against the public registry when a
newer version exists — no server, no token, no GitHub involved.
`USAGEFLEET_UPDATE=0` opts out.

**Every push to `main` publishes a new version** (`.github/workflows/release.yml`,
version = manifest major.minor + run number), so installed collectors pick up CLI
changes within ~6 hours. Treat `apps/cli` edits as shipping to user machines.

## Tests

`bun run test` in `apps/cli` (vitest). The pure pieces — parser, store, config,
guard, hook, notifier, uploader, service, claude-limits — are covered; keep new
logic in that shape rather than inside the loop.
