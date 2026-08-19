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
	real,
	unique,
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

// One Anthropic account a user's fleet draws on. A user with two Claude
// subscriptions has two rows, each with its own rate-limit percentages and its
// own group split: the percentages Anthropic reports are per account, so
// keeping one set per user let two logged-in machines overwrite each other.
// Rows are created by the collector's limits post, never by hand.
export const claudeAccounts = pgTable(
	'claude_account',
	{
		id: text('id').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		// `oauthAccount.accountUuid` from the device's Claude Code login. NULL is the
		// fallback bucket for devices whose account we can't identify (API-key
		// logins, collectors older than multi-account) — one per user, hence
		// NULLS NOT DISTINCT on the unique index.
		extId: text('ext_id'),
		email: text('email'),
		orgName: text('org_name'),
		// Latest REAL utilization reported by a collector on this account
		// ('sub' = subscription OAuth, 'api' = API key). Real, not integer: the
		// group split multiplies these by the group count, so whole-point
		// quantization would amplify on the dashboard.
		limitSource: text('limit_source'),
		fiveHourPct: real('five_hour_pct'),
		sevenDayPct: real('seven_day_pct'),
		fiveHourResetsAt: timestamp('five_hour_resets_at', { withTimezone: true }),
		sevenDayResetsAt: timestamp('seven_day_resets_at', { withTimezone: true }),
		// Per-model limits (e.g. the Fable/Opus weekly cap), from oauth/usage's
		// `limits[]` on subscriptions or the per-model rate-limit headers on API
		// keys. Small array and the set of models is dynamic, so jsonb instead of
		// dedicated columns.
		modelLimits: jsonb('model_limits').$type<StoredModelLimit[]>(),
		limitsReportedAt: timestamp('limits_reported_at', { withTimezone: true }),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		updatedAt: timestamp('updated_at').defaultNow().notNull(),
	},
	t => [unique('claude_account_user_ext_uq').on(t.userId, t.extId).nullsNotDistinct()],
)

// A desktop install of the collector. Authenticates to the ingest API with a
// long-lived bearer token; only the SHA-256 hash is stored.
export const devices = pgTable(
	'devices',
	{
		// Which Anthropic account this machine is logged into, stamped from its
		// limits posts. NULL until the first one lands. Usage is attributed to the
		// account the device is on *now*, exactly like groupId — moving a machine
		// rewrites its history.
		// Per-device kill switch for `usagefleet guard`: when false this machine is
		// never refused a prompt, even when its group's blocking switches are on.
		blockingEnabled: boolean('blocking_enabled').notNull().default(true),
		claudeAccountId: text('claude_account_id').references(() => claudeAccounts.id, {
			onDelete: 'set null',
		}),
		// Start of the window the offset below is the minimum over. Re-armed once it
		// ages out, so a clock that keeps drifting is tracked rather than pinned to
		// its first good reading.
		clockOffsetAt: timestamp('clock_offset_at', { withTimezone: true }),
		// How far this machine's clock sits behind ours, in ms, positive when behind.
		// NULL until an upload carries a usable `sentAt`. See lib/usage/clock.ts:
		// event timestamps come off this clock and limit change points off ours, so
		// delta attribution needs the two on one timeline.
		clockOffsetMs: integer('clock_offset_ms'),
		collectorVersion: text('collector_version'),
		// createdAt / lastSeenAt are tz-naive and compared against absolute instants
		// at ingest (usage.ts drops records older than createdAt) — correct while
		// Node and Postgres both run UTC, which the Docker images do by default.
		// New timestamp columns should use `withTimezone: true` instead.
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
	t => [
		index('devices_user_idx').on(t.userId),
		index('devices_group_idx').on(t.groupId),
		index('devices_claude_account_idx').on(t.claudeAccountId),
	],
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
		// Per-TTL split of cacheCreationTokens: 5m writes cost 1.25× input, 1h
		// writes 2×, and the cost-weighted group split cares. NULL means the
		// collector (or the log line) predates the breakdown — pricing then falls
		// back to the user's cacheWriteTtl setting. Distinct from a real 0.
		cacheCreation5mTokens: integer('cache_creation_5m_tokens'),
		cacheCreation1hTokens: integer('cache_creation_1h_tokens'),
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

// Per-user dashboard configuration. `weekResetWeekday`/`weekResetHourUtc` and
// the cache-TTL column are live. The `limit_*`/`*_pct`/`model_limits` columns
// are not: limits moved to `claude_account` when one user gained the ability to
// hold several Anthropic subscriptions. `plan`, `sessionLimitTokens` and
// `weeklyLimitTokens` are not either: they backed a local estimate of Anthropic's
// opaque limits, which the collector's reported percentages replaced. Nothing
// reads or writes them, and no UI edits them. Left in place because dropping
// columns is a one-way migration, not because they mean anything.
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
	// Deprecated: moved to `claude_account` (one set of percentages per Anthropic
	// account). Migration 0017 copied the last values across. Nothing reads these.
	limitSource: text('limit_source'), // 'sub' | 'api'
	fiveHourPct: integer('five_hour_pct'),
	sevenDayPct: integer('seven_day_pct'),
	fiveHourResetsAt: timestamp('five_hour_resets_at', { withTimezone: true }),
	sevenDayResetsAt: timestamp('seven_day_resets_at', { withTimezone: true }),
	modelLimits: jsonb('model_limits').$type<StoredModelLimit[]>(),
	limitsReportedAt: timestamp('limits_reported_at', { withTimezone: true }),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

/** Which limit window a sample belongs to, keyed like the rate-limit header. */
export type LimitWindow = '5h' | '7d'

/** A change point's window. Account-wide series use {@link LimitWindow}, but a
 *  per-model cap carries whatever key Anthropic sent (`/^\d{1,3}[hdwm]$/`), so
 *  this stays open — the union keeps the two known keys in autocomplete. */
export type PointWindow = LimitWindow | (string & Record<never, never>)

// Peak utilization Claude reported for ONE limit window, accumulated from the
// collector's /api/v1/limits posts (one row per window, kept at its maximum).
// Claude only reports the window that is currently open, so once a window
// closes this is the only record of how full it actually got — the past-windows
// card reads it instead of guessing a token limit. Keyed per Anthropic account:
// two subscriptions fill their windows independently.
export const limitSamples = pgTable(
	'limit_sample',
	{
		claudeAccountId: text('claude_account_id')
			.notNull()
			.references(() => claudeAccounts.id, { onDelete: 'cascade' }),
		peakPct: real('peak_pct').notNull(),
		updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		window: text('window').$type<LimitWindow>().notNull(),
		/** Window start = the reported reset instant minus the window's length. */
		windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
	},
	t => [
		primaryKey({ columns: [t.claudeAccountId, t.window, t.windowStart] }),
		index('limit_sample_account_start_idx').on(t.claudeAccountId, t.windowStart),
	],
)

// Every reading that moved a window's official percentage, one row per change.
// The timestamps let the group split attribute each *rise* to the groups active
// when it happened (delta attribution in splitByShare) instead of smearing the
// whole percentage over the window by cost. Appended by the collector's limits
// post only when the pct actually moved; rows older than the longest window are
// pruned on write. Per Anthropic account, like everything limit-shaped.
export const limitChangePoints = pgTable(
	'limit_change_point',
	{
		at: timestamp('at', { withTimezone: true }).notNull(),
		claudeAccountId: text('claude_account_id')
			.notNull()
			.references(() => claudeAccounts.id, { onDelete: 'cascade' }),
		// '' is the account-wide series; anything else is one model family's own cap
		// (StoredModelLimit.model). Both live here so a per-model row reuses the same
		// append + prune path, but every read has to filter: mixing the two series
		// would attribute a model's rises to the account headline. '' can only ever
		// mean account-wide because the ingest schema makes a model name start with an
		// alphanumeric — keep that bound if the regex is ever loosened.
		model: text('model').notNull().default(''),
		pct: real('pct').notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		window: text('window').$type<PointWindow>().notNull(),
	},
	t => [primaryKey({ columns: [t.claudeAccountId, t.window, t.model, t.at] })],
)

export const groupsRelations = relations(groups, ({ many, one }) => ({
	devices: many(devices),
	owner: one(user, { fields: [groups.ownerId], references: [user.id] }),
}))

export const devicesRelations = relations(devices, ({ one, many }) => ({
	claudeAccount: one(claudeAccounts, { fields: [devices.claudeAccountId], references: [claudeAccounts.id] }),
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
export type LimitChangePoint = typeof limitChangePoints.$inferSelect
export type ClaudeAccount = typeof claudeAccounts.$inferSelect
