import { relations } from 'drizzle-orm'
import { pgTable, text, timestamp, boolean, index, integer } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').default(false).notNull(),
	image: text('image'),
	// Written by the better-auth Stripe plugin on sign-up.
	stripeCustomerId: text('stripe_customer_id'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at')
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
})

export const session = pgTable(
	'session',
	{
		createdAt: timestamp('created_at').defaultNow().notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		id: text('id').primaryKey(),
		ipAddress: text('ip_address'),
		token: text('token').notNull().unique(),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		userAgent: text('user_agent'),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	table => [index('session_userId_idx').on(table.userId)],
)

export const account = pgTable(
	'account',
	{
		accessToken: text('access_token'),
		accessTokenExpiresAt: timestamp('access_token_expires_at'),
		accountId: text('account_id').notNull(),
		createdAt: timestamp('created_at').defaultNow().notNull(),
		id: text('id').primaryKey(),
		idToken: text('id_token'),
		password: text('password'),
		providerId: text('provider_id').notNull(),
		refreshToken: text('refresh_token'),
		refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
		scope: text('scope'),
		updatedAt: timestamp('updated_at')
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
	},
	table => [index('account_userId_idx').on(table.userId)],
)

export const verification = pgTable(
	'verification',
	{
		createdAt: timestamp('created_at').defaultNow().notNull(),
		expiresAt: timestamp('expires_at').notNull(),
		id: text('id').primaryKey(),
		identifier: text('identifier').notNull(),
		updatedAt: timestamp('updated_at')
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
		value: text('value').notNull(),
	},
	table => [index('verification_identifier_idx').on(table.identifier)],
)

// Owned by the better-auth Stripe plugin: one row per Stripe subscription,
// kept in sync by the /api/auth/stripe/webhook handler. `referenceId` is the
// owning user id (we don't use organizations). Read it through
// lib/billing.ts — never trust a plan name that isn't in the plan catalog.
export const subscription = pgTable(
	'subscription',
	{
		billingInterval: text('billing_interval'),
		cancelAt: timestamp('cancel_at'),
		cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
		canceledAt: timestamp('canceled_at'),
		endedAt: timestamp('ended_at'),
		id: text('id').primaryKey(),
		periodEnd: timestamp('period_end'),
		periodStart: timestamp('period_start'),
		plan: text('plan').notNull(),
		referenceId: text('reference_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		seats: integer('seats'),
		status: text('status').notNull().default('incomplete'),
		stripeCustomerId: text('stripe_customer_id'),
		stripeScheduleId: text('stripe_schedule_id'),
		stripeSubscriptionId: text('stripe_subscription_id'),
		trialEnd: timestamp('trial_end'),
		trialStart: timestamp('trial_start'),
	},
	table => [index('subscription_reference_idx').on(table.referenceId)],
)

export const userRelations = relations(user, ({ many }) => ({
	accounts: many(account),
	sessions: many(session),
	subscriptions: many(subscription),
}))

export const subscriptionRelations = relations(subscription, ({ one }) => ({
	user: one(user, {
		fields: [subscription.referenceId],
		references: [user.id],
	}),
}))

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}))

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}))
