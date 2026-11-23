# UsageFleet TikTok plan

Six English-language, product-led TikToks for Claude Code users. All six are
shipped; this plan is the spec they were cut against. Everything lives in
`apps/videos`, which runs on the global `tiktok` skill
(`~/.pi/agent/skills/tiktok`): `/tiktok` produces the next video, the locked
format below now lives in that skill, and the claim guardrails live in
`apps/videos/src/brand.tsx`.

## Locked format (validated by videos 1–2)

Do not renegotiate these per video.

- **Canvas:** 1080 × 1920, 30 fps, **450 frames = 15.0 s** exactly.
- **Layout:** content lives in the top 1360 px (`SCENE_PADDING = '90px 72px 640px'`,
  scenes `justifyContent: center`); `GameplayStrip` (muted Minecraft parkour,
  1080 × 560) pinned to the bottom. Nothing may render under the strip —
  absolutely-positioned elements need `bottom ≥ 600`.
- **Look:** true black `#000`, flat `Surface` cards, color only on data
  (indigo `#6366f1`, emerald `#10b981`, amber `#f59e0b`, red for pain).
  Inter Variable, tabular numerals.
- **Motion:** `Camera` punch-in on every scene (settle from 1.08 in 10 frames,
  slow drift, +5% exit kick), 8-frame scene crossfades, reveals compressed —
  a scene must read in its first 20 frames.
- **Scenes:** exactly 5 per video: hook → three middle beats → `EndCard`.
  Frame grid (8-frame overlaps, tune ±10 to VO): 0–90, 82–176, 168–264,
  256–356, 348–450.
- **Audio:** SFX and bed by `scripts/sfx.sh`, VO by `scripts/vo.ts`, mixed by
  Remotion, normalized by `scripts/render.sh` to -14 LUFS / -1 dBTP.
  - VO: ElevenLabs Lily on `eleven_v3` (v1–v6 shipped on edge-tts
    `en-US-AndrewNeural`; their clips are kept as-is), loudnorm -15 LUFS,
    `public/vo/v<N>-s<1..5>.wav`, one clip per scene. Lines must be short —
    a scene's clip has ~3 s of air. **VO text goes to ElevenLabs; never put
    anything private in it.**
  - SFX grammar: `hit` on the hook slam (vol 1.0), `whoosh` on scene cuts
    (0.6), `pop` on element reveals (0.4–0.5), `ding` once on the EndCard URL
    (0.7). `music.wav` bed under everything.
- **Gameplay:** `scripts/strip.sh <N>` cuts each video its own 15.4 s slice at
  1080 × 560 @ 30. mc-1..6 were cut by hand from one 1440p60 source and are
  kept as-is.
- **Demo data:** deterministic, invented, plausible. Never a real account.

### Claim guardrails (unchanged, non-negotiable)

- Anthropic supplies the account-level 5-hour and weekly utilization.
- UsageFleet attributes that utilization across reporting groups.
- Raw token/cost history can be split by device.
- No prompts, responses, file contents, or Claude credentials are uploaded.
- Never imply Anthropic supplies per-device percentages. Never claim
  "only usage data" — the collector also sends machine/session context.

## Per-video production loop

Steps 3–8 of the `tiktok` skill (campaign entry, strip, voiceover, composition,
stills, render), with each video's spec below as the pre-written idea.

## Video 1 — shipped

`WhichMachineAteTheLimit` → `out/01-which-machine.mp4`. Hook: limit slams to
100% (red, shake) → "which machine did it" cards → dashboard split → privacy
rows → EndCard. Cover: frame 50. Reference for tone and pacing.

## Video 2 — shipped

`ClaudeCodeOnMultipleMachines` → `out/02-multiple-machines.mp4`. Hook: three
terminals working → one 41% account card → delta attribution diagram → device
history → EndCard with privacy kicker. Cover: frame 60.

## Video 3 — Claude Code Community / feedback

**Composition:** `BuiltTheUsageView` (exists at 810 frames — compress to 450).
**Angle:** first-person community project, ends on a question, not a pitch.
**Gameplay:** `mc-3.mp4`. **Output:** `out/03-built-the-view.mp4`.

| Scene (frames) | Visual | Copy | VO (`v3-s*.wav`) |
| --- | --- | --- | --- |
| Hook 0–90 | Personal desk map: MacBook, Mac Studio, server tiles; account meter rising in uneven steps; `hit` when it jumps | `I had one unanswered question` | "I run Claude Code on three machines." |
| 82–176 | Three quick guesses cycle with red ✕ stamps (laptop? studio? server?), `pop` per stamp | `Which machine moved my limit?` | "Every time the limit moved — no idea which one did it." |
| 168–264 | Tiny collector line tails counters; prompt text visibly masked/discarded (numbers pass, text blocked) | `So I built a read-only collector` | "So I built the view I wanted." |
| 256–356 | Dashboard demo: account total on top, my three groups with split bars below | `Anthropic's number, my split` | "Anthropic's official number, attributed across my own machines." |
| EndCard 348–450 | `EndCard` question variant, kicker above strip | `Would you run this?` / `usagefleet.com` | "Would you run this? Tell me what's missing." |

**Cut from the old 810-frame version:** separate privacy-boundary scene (one
masked-prompt beat inside scene 3 carries it), the long screen-recording pan.
**Cover:** mid scene 2 (~frame 130): three machines with red ✕ under "Which
machine moved my limit?".
**Caption:**
> I couldn't tell which of my 3 machines was eating my Claude Code limit. So I
> built the view I wanted: Anthropic's official number, split across my own
> machines. Would you run this? What's missing?
> usagefleet.com
> #claudecode #claude #anthropic #aicoding #vibecoding #buildinpublic #programming #developer #devtools #opensource

## Video 4 — Build in Public / product story

**Composition:** `FromAnnoyanceToProduct` (exists at 840 frames — compress to
450). **Angle:** dated build story; the payoff is discipline (deleting
features). **Gameplay:** `mc-4.mp4`. **Output:** `out/04-annoyance-to-product.mp4`.

| Scene (frames) | Visual | Copy | VO (`v4-s*.wav`) |
| --- | --- | --- | --- |
| Hook 0–90 | Black card, one sentence lands hard (`hit`), then three machines orbit one meter | `Tiny product. Very specific annoyance.` | "This product exists because of one very specific annoyance." |
| 82–176 | Terminal tailer: log lines pass a narrow mask, only counters survive, `pop` per surviving counter | `Day 1 — counts, not conversations` | "Day one: collect counts, never conversations." |
| 168–264 | Before/after wipe: lone `41%` card → rough first group split snapping into focus | `Day 3 — first useful split` | "Day three: the first split that actually answered it." |
| 256–356 | Feature cards appear and get deleted one by one (AI chat, prompt analytics, reports) until one card remains, delete-key rhythm | `The hard part: not building more` | "The hard part? Not building everything else." |
| EndCard 348–450 | `EndCard`, kicker `One job: show where the limit went` | `Building in public` / `usagefleet.com` | "One job. Building it in public. usagefleet dot com." |

**Cut from the old version:** Day-0 orbit as its own scene (folded into hook),
the collect→attribute→guard loop diagram.
**Cover:** mid scene 3 (~frame 215): `Before: 41%` / `After:` split.
**Caption:**
> Built a tiny SaaS because of one annoyance: 3 machines, 1 Claude
> subscription, zero breakdown. Day 1: collect counts, not conversations. Day
> 3: first useful split. Hardest part: not building everything else.
> usagefleet.com
> #buildinpublic #claudecode #claude #aicoding #vibecoding #indiehacker #saas #programming #developer #startup

## Video 5 — Indie Hackers / micro-SaaS

**Composition:** `FocusedMicroSaaS` (exists at 810 frames — compress to 450).
**Angle:** narrow scope as the advantage; deletion is the visual payoff.
**Gameplay:** `mc-5.mp4`. **Output:** `out/05-focused-micro-saas.mp4`.

| Scene (frames) | Visual | Copy | VO (`v5-s*.wav`) |
| --- | --- | --- | --- |
| Hook 0–90 | Empty black grid, one bright dot scales in (`hit`), expands into a `41% used` card that stacks three deep | `A micro-SaaS needs one recurring irritation` | "A micro-SaaS doesn't need a huge idea." |
| 82–176 | One fixed account total vs three named machines with blank bars | `One total. Several machines. No breakdown.` | "It needs a recurring irritation. Like this one." |
| 168–264 | Three boxes draw once: collector → attribution → dashboard; `pop` per box | `That's the whole product` | "Collector. Attribution. Dashboard. That's the whole product." |
| 256–356 | Giant "AI analytics platform" panel loses modules until only the UsageFleet card remains | `Not another giant AI dashboard` | "Not another giant AI platform. On purpose." |
| EndCard 348–450 | `EndCard` question variant, kicker `Start with one machine` | `Focused enough — or too narrow?` / `usagefleet.com` | "Focused enough — or too narrow? You tell me." |

**Cut from the old version:** separate live-limits/history/spend feature tour,
pricing beat.
**Cover:** mid scene 2 (~frame 130): `One total. Several machines. No breakdown.`
**Caption:**
> Turned one recurring irritation into a tiny SaaS: one Claude subscription,
> several machines, no breakdown. Collector → attribution → dashboard. That's
> the whole product, on purpose. Focused enough — or too narrow?
> usagefleet.com
> #indiehacker #microsaas #saas #buildinpublic #claudecode #aicoding #vibecoding #programming #developer #startup

## Video 6 — Tech Founders / team and business

**Composition:** `ClaudeFleetForTeams` (exists at 780 frames — compress to
450). **Angle:** operational visibility for teams; no enterprise-control
claims. **Gameplay:** `mc-6.mp4`. **Output:** `out/06-fleet-for-teams.mp4`.

| Scene (frames) | Visual | Copy | VO (`v6-s*.wav`) |
| --- | --- | --- | --- |
| Hook 0–90 | Fleet map fills in functional groups: laptops, workstations, CI nodes; `hit` when complete | `Your team shares an AI budget` | "Your team shares one Claude budget." |
| 82–176 | All nodes feed one anonymous percentage; source labels fade out | `Does anyone know where it goes?` | "Does anyone actually know where it goes?" |
| 168–264 | UsageFleet restores group labels; per-group budget slices with color as the organizer | `See the window by group. Live.` | "See the five-hour and weekly window by group. Live." |
| 256–356 | Alert fires at 80% (amber), guard blocks at 100% (red), then offline state passes green | `Alert early. Guard fails open.` | "Alert at eighty. Guard at one hundred. Offline? It fails open." |
| EndCard 348–450 | `EndCard`, kicker `No prompts · tokens stored hashed` | `Built for teams using Claude Code way too much` / `usagefleet.com` | "Built for teams using Claude Code way too much." |

**Cut from the old version:** separate multi-account/spend scene, standalone
privacy scene (kicker carries it).
**Cover:** mid scene 4 (~frame 300): amber 80% alert + red guard block.
**Caption:**
> Once a team runs Claude Code on laptops, desktops and CI, one account
> percentage stops being enough. UsageFleet shows the live window by group,
> alerts early, and guards fail-open. No prompts, no source code.
> usagefleet.com
> #claudecode #claude #anthropic #aicoding #devtools #engineering #cto #programming #developer #saas

## Production order and review gates

1. **#3 → #5 → #4 → #6.** #3 first (same dashboard vocabulary as #2, cheapest
   compression), #5 next (deletion visual is new but simple), #4 (timeline),
   #6 last (densest new visuals: fleet map, guard states).
2. Gate after each video: stills review before render, played-back mp4 with
   audio before moving to the next.
3. Alternate hooks stay distinct across the series: meter slam (1), terminals
   (2), first-person question (3), title-card confession (4), dot-in-grid (5),
   fleet map (6). If two hooks converge during implementation, change the
   later one.
4. Test one private TikTok upload after #3 to verify the strip/safe-area
   assumptions on a real device before batch-producing #4–#6.
