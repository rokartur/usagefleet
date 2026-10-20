/** Alert presets for a device's desktop notifications. Names only: the collector owns
 *  the thresholds (NOTIFY_MODES in apps/cli/src/notifier.ts) and reads the pick back
 *  from GET /api/v1/limits, so keep the two lists in step. */
export const NOTIFY_MODES = ['off', 'quiet', 'standard', 'steady', 'critical'] as const

export type NotifyMode = (typeof NOTIFY_MODES)[number]

export function isNotifyMode(value: unknown): value is NotifyMode {
	return NOTIFY_MODES.some(mode => mode === value)
}
