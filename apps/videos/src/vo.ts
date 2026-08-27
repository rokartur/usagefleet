// Campaign copy in one place: what each clip says, where it sits in the
// timeline, and the post text that ships with the file. The renderer burns the
// captions in, scripts/captions.ts writes the .srt and .txt sidecars from the
// same data, and the array order numbers the output files.

export const FPS = 30

// Chunk timing comes from the text alone: the edge-tts voice at rate +12%
// measures ~16.5 chars/s across public/vo, so a duration table would be one
// more thing to keep in sync for ~0.2s of accuracy.
// ponytail: constant rate; move to word timings from whisper if lines drift.
const CHARS_PER_SECOND = 16.5
const CAPTION_MAX_CHARS = 24
const MIN_CHUNK_FRAMES = 10

// Words grouped into short lines, with a hard break after sentence-ending
// punctuation so beats like "No prompts." get their own card.
function chunkCaption(text: string) {
	const chunks: string[] = []
	let current = ''

	for (const word of text.split(' ')) {
		const joined = current ? `${current} ${word}` : word
		if (joined.length > CAPTION_MAX_CHARS && current) {
			chunks.push(current)
			current = word
		} else {
			current = joined
		}
		if (/[.?!]$/.test(current)) {
			chunks.push(current)
			current = ''
		}
	}
	if (current) {
		chunks.push(current)
	}

	return chunks
}

// Frames are relative to the clip's own start.
export function captionChunks(text: string) {
	let from = 0

	return chunkCaption(text).map(chunk => {
		const to = from + Math.max(MIN_CHUNK_FRAMES, Math.round((chunk.length / CHARS_PER_SECOND) * FPS))
		const chunkFrom = from
		from = to

		return { from: chunkFrom, text: chunk, to }
	})
}

export const CAMPAIGN = [
	{
		clips: [
			{ at: 4, src: 'vo/v1-s1.wav', text: 'Claude limit: 100%.' },
			{ at: 70, src: 'vo/v1-s2.wav', text: 'Which machine did it? Stop guessing.' },
			{
				at: 174,
				src: 'vo/v1-s3.wav',
				text: "UsageFleet splits Anthropic's official number across your machines. Live.",
			},
			{ at: 302, src: 'vo/v1-s4.wav', text: 'No prompts. No responses. No file contents.' },
			{ at: 396, src: 'vo/v1-s5.wav', text: 'UsageFleet.com' },
		],
		id: 'WhichMachineAteTheLimit',
		post: `Your Claude limit just hit 100% and you have no idea which machine did it.

UsageFleet reads Anthropic's own percentage and splits it across your devices, live. Token counts and cost per machine. No prompts, no responses, no file contents.

usagefleet.com

#claudecode #ai #devtools #buildinpublic #indiehackers`,
	},
	{
		clips: [
			{ at: 4, src: 'vo/v2-s1.wav', text: 'Claude Code on multiple machines? One subscription.' },
			{ at: 96, src: 'vo/v2-s2.wav', text: 'UsageFleet shows which machines are spending it.' },
			{ at: 206, src: 'vo/v2-s3.wav', text: 'Usage and cost, split by device.' },
			{ at: 294, src: 'vo/v2-s4.wav', text: 'Setup? Two commands.' },
			{ at: 364, src: 'vo/v2-s5.wav', text: 'Nothing private leaves. UsageFleet.com' },
		],
		id: 'ClaudeCodeOnMultipleMachines',
		post: `Laptop, desktop, work machine. One Claude subscription, zero visibility.

UsageFleet shows usage and cost per device, and the official 5-hour and weekly windows split across them. Two commands to set up. Nothing private ever leaves your machine.

usagefleet.com

#claudecode #ai #devtools #buildinpublic #indiehackers`,
	},
	{
		clips: [
			{ at: 6, src: 'vo/v3-s1.wav', text: 'I run Claude Code on three machines.' },
			{ at: 86, src: 'vo/v3-s2.wav', text: 'Every time the limit moved, no idea which one did it.' },
			{ at: 174, src: 'vo/v3-s3.wav', text: 'So I built the view I wanted.' },
			{ at: 260, src: 'vo/v3-s4.wav', text: "Anthropic's official number, attributed across my own machines." },
			{ at: 362, src: 'vo/v3-s5.wav', text: "Would you run this? Tell me what's missing." },
		],
		id: 'BuiltTheUsageView',
		post: `I run Claude Code on three machines and never knew which one ate the limit.

So I built the view I wanted: Anthropic's official percentage, attributed to the machine that actually moved it.

Would you run this? Tell me what's missing.

usagefleet.com

#claudecode #buildinpublic #indiehackers #devtools #ai`,
	},
	{
		clips: [
			{ at: 4, src: 'vo/v4-s1.wav', text: 'This product exists because of one very specific annoyance.' },
			{ at: 102, src: 'vo/v4-s2.wav', text: 'Day one: collect counts, never conversations.' },
			{ at: 194, src: 'vo/v4-s3.wav', text: 'Day three: the first split that actually answered it.' },
			{ at: 274, src: 'vo/v4-s4.wav', text: 'The hard part? Not building everything else.' },
			{ at: 344, src: 'vo/v4-s5.wav', text: 'One job. Building it in public. usagefleet.com' },
		],
		id: 'FromAnnoyanceToProduct',
		post: `From annoyance to product.

Day one: collect counts, never conversations. Day three: the first split that actually answered the question. The hard part was not building everything else.

One job, done properly. Building it in public.

usagefleet.com

#buildinpublic #indiehackers #microsaas #claudecode #devtools`,
	},
	{
		clips: [
			{ at: 6, src: 'vo/v5-s1.wav', text: "A micro-SaaS doesn't need a huge idea." },
			{ at: 84, src: 'vo/v5-s2.wav', text: 'It needs a recurring irritation. Like this one.' },
			{ at: 170, src: 'vo/v5-s3.wav', text: "Collector. Attribution. Dashboard. That's the whole product." },
			{ at: 278, src: 'vo/v5-s4.wav', text: 'Not another giant AI platform. On purpose.' },
			{ at: 364, src: 'vo/v5-s5.wav', text: 'Focused enough, or too narrow? You tell me.' },
		],
		id: 'FocusedMicroSaaS',
		post: `A micro-SaaS doesn't need a huge idea. It needs a recurring irritation.

Collector, attribution, dashboard. That's the whole product. Not another giant AI platform, on purpose.

Focused enough, or too narrow? You tell me.

usagefleet.com

#microsaas #indiehackers #buildinpublic #claudecode #devtools`,
	},
	{
		clips: [
			{ at: 8, src: 'vo/v6-s1.wav', text: 'Your team shares one Claude budget.' },
			{ at: 86, src: 'vo/v6-s2.wav', text: 'Does anyone actually know where it goes?' },
			{ at: 166, src: 'vo/v6-s3.wav', text: 'See the 5-hour and weekly window by group. Live.' },
			{ at: 264, src: 'vo/v6-s4.wav', text: 'Alert at 80. Guard at 100. Offline? It fails open.' },
			{ at: 375, src: 'vo/v6-s5.wav', text: 'Built for teams using Claude Code way too much.' },
		],
		id: 'ClaudeFleetForTeams',
		post: `Your team shares one Claude budget. Does anyone actually know where it goes?

UsageFleet splits the official 5-hour and weekly windows by group, alerts at 80%, and guards prompts at 100%. Offline it fails open, so nobody gets blocked by the tracker.

usagefleet.com

#claudecode #engineeringmanagement #devtools #ai #buildinpublic`,
	},
] as const

export type VideoId = (typeof CAMPAIGN)[number]['id']
