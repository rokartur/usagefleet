import type { Brand } from './kit'

export function UsageFleetMark({ size = 48 }: { size?: number }) {
	return (
		<svg width={size} height={size} viewBox='0 0 32 32' aria-hidden>
			<path fill='currentColor' d='M3 4h8l9 9h9v6h-9l-9 9H3v-6h5.5l6-6-6-6H3V4Zm0 9h13v6H3v-6Z' />
		</svg>
	)
}

// The product brief every video is written against. The tiktok skill reads it
// before pitching ideas; EndCard renders name, mark and url.
export const BRAND: Brand = {
	name: 'UsageFleet',
	url: 'usagefleet.com',
	mark: UsageFleetMark,
	tags: ['#claudecode', '#devtools'],
	youtubeChannel: 'UCYbzrYSJt89li8Hn9SVuPaw',
	facts: [
		'Anthropic supplies the account-level 5-hour and weekly utilization; UsageFleet attributes it across reporting groups.',
		'Raw token and cost history can be split by device.',
		'One subscription used on many machines; a device counts against the account it is signed into.',
		'Alert at a chosen percentage; `usagefleet guard` blocks prompts at 100% and fails open when offline.',
		'Collector is two commands to install; it self-updates.',
		'No prompts, responses, file contents or Claude credentials are uploaded.',
	],
	never: [
		'That Anthropic supplies per-device percentages.',
		'"Only usage data" leaves the machine: the collector also sends machine and session context.',
		'Enterprise controls, quotas or blocking by admins.',
	],
	// Artur's instant clone (scripts/clone-voice.sh, from the StartIT reel) on Eleven v3.
	// Videos 1-6 shipped on edge-tts, 7 on the premade "Liam"; they keep their clips.
	voice: { id: 'gj1mvZ8h3QyjiRVNn1MP', model: 'eleven_v3' },
}
