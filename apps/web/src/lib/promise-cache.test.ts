import { describe, expect, it, vi } from 'vitest'
import { createPromiseCache } from './promise-cache'

describe(createPromiseCache, () => {
	it('serves one flight per key until the ttl expires', async () => {
		const load = vi.fn(async (k: string) => `v:${k}`)
		const cache = createPromiseCache(60_000, load)

		await expect(cache('a')).resolves.toBe('v:a')
		await expect(cache('a')).resolves.toBe('v:a')
		await expect(cache('b')).resolves.toBe('v:b')

		expect(load).toHaveBeenCalledTimes(2) // once per key, not per call
	})

	it('collapses concurrent callers onto a single flight', async () => {
		let started = 0
		const cache = createPromiseCache(60_000, async () => {
			started++
			await Promise.resolve()
			return started
		})

		// The point of caching the promise rather than the value: these all arrive
		// before the first flight settles, so a value cache would run five loads.
		const all = await Promise.all([cache('k'), cache('k'), cache('k'), cache('k'), cache('k')])

		expect(started).toBe(1)
		expect(all).toStrictEqual([1, 1, 1, 1, 1])
	})

	it('reloads once the ttl has passed', async () => {
		const load = vi.fn(async () => Date.now())
		const cache = createPromiseCache(1000, load)
		const now = vi.spyOn(Date, 'now').mockReturnValue(0)

		await cache('k')
		now.mockReturnValue(999)
		await cache('k')
		expect(load).toHaveBeenCalledOnce()

		now.mockReturnValue(1000)
		await cache('k')
		expect(load).toHaveBeenCalledTimes(2)

		now.mockRestore()
	})

	it('does not serve a failure for the rest of the window', async () => {
		let attempt = 0
		const cache = createPromiseCache(60_000, async () => {
			attempt++
			if (attempt === 1) {
				throw new Error('blip')
			}
			return 'recovered'
		})

		await expect(cache('k')).rejects.toThrow('blip')
		// Without eviction on rejection, one blip would block every caller for the
		// full ttl — the failure mode this cache exists to avoid making worse.
		await expect(cache('k')).resolves.toBe('recovered')
	})

	it('prunes expired keys instead of growing forever', async () => {
		const cache = createPromiseCache(1000, async (k: number) => k)
		const now = vi.spyOn(Date, 'now').mockReturnValue(0)

		for (let i = 0; i < 500; i++) {
			await cache(i)
		}
		expect(cache.size()).toBe(500)

		// Size is the only observable effect of pruning: an expired entry is a miss
		// whether or not it was swept, so a hit/miss assertion cannot see the leak.
		now.mockReturnValue(5000)
		await cache(-1)
		expect(cache.size()).toBe(1)

		now.mockRestore()
	})

	it('lets a late rejection evict only its own entry, not the flight that replaced it', async () => {
		let failFirst!: (e: Error) => void
		const flights: Promise<string>[] = [
			new Promise((_resolve, reject) => {
				failFirst = reject
			}),
			Promise.resolve('fresh'),
		]
		const cache = createPromiseCache(1000, () => flights.shift()!)
		const now = vi.spyOn(Date, 'now').mockReturnValue(0)

		const stale = cache('k')
		stale.catch(() => {}) // asserted on below; don't trip unhandled-rejection first

		now.mockReturnValue(2000)
		await expect(cache('k')).resolves.toBe('fresh')

		// The first flight only fails now, after a second one has taken its slot.
		// Evicting on rejection without checking identity would throw away the good
		// entry, so every later caller pays for the scan again.
		failFirst(new Error('late'))
		await expect(stale).rejects.toThrow('late')
		expect(cache.size()).toBe(1)
		await expect(cache('k')).resolves.toBe('fresh')

		now.mockRestore()
	})
})
