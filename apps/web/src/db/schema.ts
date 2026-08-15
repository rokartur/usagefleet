import { relations } from 'drizzle-orm'
import {
	pgTable,
	pgEnum,
	text,
	timestamp,
	integer,
	bigint,
	boolean,
	index,
	jsonb,
	primaryKey,
	uniqueIndex,
} from 'drizzle-orm/pg-core'
import { user } from './auth-schema'

// Re-export the better-auth-owned tables (user/session/account/verification).
export * from './auth-schema'

export const osEnum = pgEnum('os', ['mac', 'linux', 'windows'])
export const planEnum = pgEnum('plan', ['pro', 'max5', 'max20', 'custom'])

// A named bucket of devices; usage is reported per group.
export const groups = pgTable(
	'groups',
	{
		id: text('id').primaryKey(),
		ownerId: text('owner_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		color: text('color').notNull().default('#6366f1'),
		// When on, this group's devices refuse new prompts once the group has eaten
		// its budget slice (an equal share of the account limit) for that window.
		// Enforced by `usagefleet guard` via GET /api/v1/limits; owners toggle them
		// per group in the group dialog.
		blockOnSessionLimit: boolean('block_on_session_limit').notNull().default(false),
		blockOnWeeklyLimit: boolean('block_on_weekly_limit').notNull().default(false),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	t => [index('groups_owner_idx').on(t.ownerId)],
)

// A desktop install of the collector. Authenticates to the ingest API with a
// long-lived bearer token; only the SHA-256 hash is stored.
export const devices = pgTable(
	'devices',
	{
		collectorVersion: text('collector_version'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		groupId: text('group_id').references(() => groups.id, {
			onDelete: 'set null',
		}),
		hostname: text('hostname'),
		id: text('id').primaryKey(),
		lastSeenAt: timestamp('last_seen_at'),
		name: text('name').notNull(),
		os: osEnum('os'),
		revoked: boolean('revoked').notNull().default(false),
		tokenHash: text('token_hash').notNull().unique(),
		tokenPrefix: text('token_prefix').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	t => [index('devices_user_idx').on(t.userId), index('devices_group_idx').on(t.groupId)],
)

// One raw JSONL assistant-message segment, deduped server-side on `uuid`.
// Aggregation folds rows by (messageId, requestId) — see lib/usage/fold.ts.
export const usageEvents = pgTable(
	'usage_event',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		deviceId: text('device_id')
			.notNull()
			.references(() => devices.id, { onDelete: 'cascade' }),
		uuid: text('uuid').notNull(),
		messageId: text('message_id'),
		requestId: text('request_id'),
		model: text('model'),
		sessionId: text('session_id'),
		ts: timestamp('ts', { withTimezone: true }).notNull(),
		inputTokens: integer('input_tokens').notNull().default(0),
		outputTokens: integer('output_tokens').notNull().default(0),
		cacheCreationTokens: integer('cache_creation_tokens').notNull().default(0),
		cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
		serviceTier: text('service_tier'),
		cwd: text('cwd'),
		gitBranch: text('git_branch'),
		claudeVersion: text('claude_version'),
		// Which Claude app produced the row: 'cli' = Claude Code, 'desktop' = Claude
		// Desktop agent-mode sessions. Legacy rows default to 'cli'.
		source: text('source').notNull().default('cli'),
		createdAt: timestamp('created_at').defaultNow().notNull(),
	},
	t => [
		// Dedup is scoped per-user so one account can never suppress/poison another
		// account's rows by reusing a uuid.
		uniqueIndex('usage_event_user_uuid_uq').on(t.userId, t.uuid),
		index('usage_event_user_ts_idx').on(t.userId, t.ts),
		index('usage_event_device_ts_idx').on(t.deviceId, t.ts),
	],
)

/** One collector-reported per-model limit, stored verbatim in jsonb. */
export interface StoredModelLimit {
	/** Model family key from the rate-limit header, e.g. "fable" / "opus". */
	model: string
	/** Window key from the header, e.g. "5h" / "7d". */
	window: string
	pct: number | null
	/** ISO timestamp, or null when the reset header was absent. */
	resetsAt: string | null
}

// Per-user limit configuration. Defaults mirror the `max5` plan preset; the
// numbers approximate Anthropic's (opaque) limits and are editable in Settings.
export const userSettings = pgTable('user_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	plan: planEnum('plan').notNull().default('max5'),
	sessionLimitTokens: bigint('session_limit_tokens', { mode: 'number' }).notNull().default(88_000),
	weeklyLimitTokens: bigint('weekly_limit_tokens', { mode: 'number' }).notNull().default(2_200_000),
	weekResetWeekday: integer('week_reset_weekday').notNull().default(1), // 0=Sun
	weekResetHourUtc: integer('week_reset_hour_utc').notNull().default(0),
	// Neither the group cap nor the paid device cap is stored here — both come
	// from the account's Stripe plan (see lib/billing.ts) so they can't be
	// self-granted. A group may exist per device slot.
	// The one exception: an admin can raise how many devices THIS account gets
	// without a subscription (null = the catalog's FREE_DEVICES). Only ever set
	// from the admin panel, never from Settings.
	freeDeviceLimit: integer('free_device_limit'),
	// Cache-write TTL used for pricing ('5m' | '1h'). Claude Code writes 5m caches
	// unless the user sets ENABLE_PROMPT_CACHING_1H=1.
	cacheWriteTtl: text('cache_write_ttl').notNull().default('5m'),
	// Deprecated (manual sessionKey flow, replaced by collector-reported limits).
	// Kept as nullable no-op columns to avoid a destructive migration.
	claudeSessionKey: text('claude_session_key'),
	claudeOrgId: text('claude_org_id'),
	// Latest REAL utilization reported by the collector (read from the local
	// Claude Code login on a device — `sub` = subscription OAuth, `api` = API key).
	limitSource: text('limit_source'), // 'sub' | 'api'
	fiveHourPct: integer('five_hour_pct'),
	sevenDayPct: integer('seven_day_pct'),
	fiveHourResetsAt: timestamp('five_hour_resets_at', { withTimezone: true }),
	sevenDayResetsAt: timestamp('seven_day_resets_at', { withTimezone: true }),
	// Per-model limits (e.g. the Fable/Opus weekly cap) as reported by the
	// collector from Anthropic's per-model rate-limit headers. Small array; the
	// set of models is dynamic, so jsonb instead of dedicated columns.
	modelLimits: jsonb('model_limits').$type<StoredModelLimit[]>(),
	limitsReportedAt: timestamp('limits_reported_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/** Which limit window a sample belongs to, keyed like the rate-limit header. */
export type LimitWindow = '5h' | '7d'

// Peak utilization Claude reported for ONE limit window, accumulated from the
// collector's /api/v1/limits posts (one row per window, kept at its maximum).
// Claude only reports the window that is currently open, so once a window
// closes this is the only record of how full it actually got — the past-windows
// card reads it instead of guessing a token limit.
export const limitSamples = pgTable(
	'limit_sample',
	{
		peakPct: integer('peak_pct').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		window: text('window').$type<LimitWindow>().notNull(),
		/** Window start = the reported reset instant minus the window's length. */
		windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
	},
	t => [
		primaryKey({ columns: [t.userId, t.window, t.windowStart] }),
		index('limit_sample_user_start_idx').on(t.userId, t.windowStart),
	],
)

export const groupsRelations = relations(groups, ({ many, one }) => ({
	devices: many(devices),
	owner: one(user, { fields: [groups.ownerId], references: [user.id] }),
}))

export const devicesRelations = relations(devices, ({ one, many }) => ({
	events: many(usageEvents),
	group: one(groups, { fields: [devices.groupId], references: [groups.id] }),
	user: one(user, { fields: [devices.userId], references: [user.id] }),
}))

export const usageEventsRelations = relations(usageEvents, ({ one }) => ({
	device: one(devices, {
		fields: [usageEvents.deviceId],
		references: [devices.id],
	}),
}))

export type Device = typeof devices.$inferSelect
export type Group = typeof groups.$inferSelect
export type UsageEvent = typeof usageEvents.$inferSelect
export type UserSettings = typeof userSettings.$inferSelect
export type LimitSample = typeof limitSamples.$inferSelect
