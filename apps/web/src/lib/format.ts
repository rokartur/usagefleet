export function formatTokens(n: number): string {
	if (n >= 1_000_000) {
		return `${(n / 1_000_000).toFixed(2)}M`
	}
	if (n >= 1000) {
		return `${(n / 1000).toFixed(1)}k`
	}
	return String(n)
}

export function formatUsd(n: number): string {
	if (n === 0) {
		return '$0'
	}
	if (n < 0.01) {
		return '<$0.01'
	}
	return `$${n.toFixed(2)}`
}

export function formatRelative(d: Date | string | null): string {
	if (!d) {
		return 'never'
	}
	const date = typeof d === 'string' ? new Date(d) : d
	const diff = Date.now() - date.getTime()
	const min = Math.floor(diff / 60_000)
	if (min < 1) {
		return 'just now'
	}
	if (min < 60) {
		return `${min}m ago`
	}
	const h = Math.floor(min / 60)
	if (h < 24) {
		return `${h}h ago`
	}
	const days = Math.floor(h / 24)
	return `${days}d ago`
}

export const OS_LABEL: Record<string, string> = {
	linux: 'Linux',
	mac: 'macOS',
	windows: 'Windows',
}
