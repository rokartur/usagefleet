import { describe, expect, it } from 'vitest'
import { parseLimitsHeaders, parseOauthUsage, parsePct, parseReset } from './claude-limits.js'

describe(parsePct, () => {
	it('reads a percent header', () => {
		expect(parsePct('37')).toBe(37)
		expect(parsePct('0')).toBe(0)
	})

	it('reads a sub-1% header as itself, not as 100%', () => {
		expect(parsePct('1')).toBe(1)
		expect(parsePct('0.5')).toBe(1)
	})

	it('clamps out of range', () => {
		expect(parsePct('140')).toBe(100)
		expect(parsePct('-3')).toBe(0)
	})

	it('returns null for missing/invalid', () => {
		expect(parsePct(null)).toBeNull()
		expect(parsePct('')).toBeNull()
		expect(parsePct('abc')).toBeNull()
		// Infinity must not clamp to a plausible-looking 100 and block every prompt.
		expect(parsePct('1e999')).toBeNull()
	})
})

describe(parseReset, () => {
	it('parses unix seconds', () => {
		expect(parseReset('1781827200')).toBe(new Date(1_781_827_200 * 1000).toISOString())
	})

	it('passes through ISO', () => {
		expect(parseReset('2026-06-18T04:00:00Z')).toBe('2026-06-18T04:00:00.000Z')
	})

	it('returns null for empty', () => {
		expect(parseReset(null)).toBeNull()
	})
})

describe(parseLimitsHeaders, () => {
	it('maps the unified rate-limit headers', () => {
		const headers: Record<string, string> = {
			'anthropic-ratelimit-unified-5h-reset': '2026-06-18T04:00:00Z',
			'anthropic-ratelimit-unified-5h-utilization': '42',
			'anthropic-ratelimit-unified-7d-reset': '2026-06-22T00:00:00Z',
			'anthropic-ratelimit-unified-7d-utilization': '73',
		}
		const r = parseLimitsHeaders('sub', n => headers[n] ?? null, Object.keys(headers))
		expect(r).toStrictEqual({
			fiveHourPct: 42,
			fiveHourResetsAt: '2026-06-18T04:00:00.000Z',
			modelLimits: [],
			sevenDayPct: 73,
			sevenDayResetsAt: '2026-06-22T00:00:00.000Z',
			source: 'sub',
		})
	})

	it('collects per-model limits from dynamic header names', () => {
		const headers: Record<string, string> = {
			'anthropic-ratelimit-unified-7d-utilization': '73',
			'anthropic-ratelimit-unified-7d-reset': '2026-06-22T00:00:00Z',
			'anthropic-ratelimit-unified-7d-fable-utilization': '23',
			'anthropic-ratelimit-unified-7d-fable-reset': '2026-07-04T00:59:00Z',
			'anthropic-ratelimit-unified-5h-opus-utilization': '0.5',
			// requests-per-minute style headers must NOT match the model pattern
			'anthropic-ratelimit-requests-limit': '50',
		}
		const r = parseLimitsHeaders('sub', n => headers[n] ?? null, Object.keys(headers))
		expect(r.modelLimits).toStrictEqual([
			{
				model: 'fable',
				pct: 23,
				resetsAt: '2026-07-04T00:59:00.000Z',
				window: '7d',
			},
			{ model: 'opus', pct: 1, resetsAt: null, window: '5h' },
		])
	})

	it('keeps working without a names iterable (no model limits)', () => {
		const r = parseLimitsHeaders('api', () => null)
		expect(r.modelLimits).toStrictEqual([])
	})
})

describe(parseOauthUsage, () => {
	it('extracts model-scoped entries from limits[] (real payload shape)', () => {
		const body = {
			five_hour: { resets_at: '2026-07-02T16:29:59+00:00', utilization: 4 },
			limits: [
				{
					group: 'session',
					is_active: false,
					kind: 'session',
					percent: 4,
					resets_at: '2026-07-02T16:29:59+00:00',
					scope: null,
				},
				{
					group: 'weekly',
					is_active: false,
					kind: 'weekly_all',
					percent: 14,
					resets_at: '2026-07-03T23:59:59+00:00',
					scope: null,
				},
				{
					group: 'weekly',
					is_active: true,
					kind: 'weekly_scoped',
					percent: 25,
					resets_at: '2026-07-03T23:59:59+00:00',
					scope: { model: { display_name: 'Fable', id: null }, surface: null },
				},
			],
			seven_day: { resets_at: '2026-07-03T23:59:59+00:00', utilization: 14 },
			seven_day_opus: null,
		}
		expect(parseOauthUsage(body)).toStrictEqual([
			{
				model: 'fable',
				pct: 25,
				resetsAt: '2026-07-03T23:59:59.000Z',
				window: '7d',
			},
		])
	})

	it('falls back to legacy top-level seven_day_<model> objects', () => {
		const body = {
			seven_day_opus: { resets_at: '2026-07-03T23:59:59Z', utilization: 61 },
			seven_day_sonnet: null,
		}
		expect(parseOauthUsage(body)).toStrictEqual([
			{
				model: 'opus',
				pct: 61,
				resetsAt: '2026-07-03T23:59:59.000Z',
				window: '7d',
			},
		])
	})

	it('returns [] for junk', () => {
		expect(parseOauthUsage(null)).toStrictEqual([])
		expect(parseOauthUsage('x')).toStrictEqual([])
		expect(parseOauthUsage({ limits: 'nope' })).toStrictEqual([])
	})
})
