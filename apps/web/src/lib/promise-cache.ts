/**
 * Cache one in-flight promise per key for `ttlMs`.
 *
 * The *promise* is cached, not its value, so callers arriving during a flight
 * share it instead of stampeding the source — the case that matters here, since
 * both users (the GitHub release lookup and the all-time history scan) are
 * expensive things a burst of tabs or devices asks for at once.
 *
 * A rejected entry is evicted as soon as it settles, so one blip cannot serve a
 * stuck error for the rest of the window. Expired entries are pruned on the way
 * past, so the map stays proportional to the keys in active use rather than
 * growing with every key ever seen.
 *
 * In-process only: it resets on restart and is per-instance, like the rate
 * limiter. Both current uses are caches, not correctness barriers, so a second
 * replica simply means a second flight.
 */
export function createPromiseCache<K, V>(ttlMs: number, load: (key: K) => Promise<V>) {
	const entries = new Map<K, { at: number; value: Promise<V> }>()

	const get = (key: K): Promise<V> => {
		const now = Date.now()
		const hit = entries.get(key)
		if (hit && now - hit.at < ttlMs) {
			return hit.value
		}

		for (const [k, entry] of entries) {
			if (now - entry.at >= ttlMs) {
				entries.delete(k)
			}
		}

		const value = load(key)
		entries.set(key, { at: now, value })
		// Compare identity, not presence: a newer flight may already have replaced
		// this entry by the time a slow rejection lands, and it must not be evicted.
		value.catch(() => {
			if (entries.get(key)?.value === value) {
				entries.delete(key)
			}
		})
		return value
	}

	// `size` exists so the prune above is testable at all: every other effect of
	// pruning is invisible from outside, because an expired entry is a miss with
	// or without it. Without this, "the map stays bounded" is an untestable claim.
	return Object.assign(get, { size: () => entries.size })
}
