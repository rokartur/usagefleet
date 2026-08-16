-- Multi-account: limits move from user_settings to one row per Anthropic account.
--
-- The 5h/7d percentages are Anthropic's, and Anthropic reports them per
-- subscription. Storing one set per UsageFleet user meant two machines signed
-- into different Claude accounts overwrote each other every five minutes, and
-- the group split divided the wrong budget. Limits now live on `claude_account`,
-- keyed by the `oauthAccount.accountUuid` the collector reads locally.
--
-- Every existing user with anything to preserve gets one account row with
-- ext_id = NULL: the "we don't know which login this is" bucket, which is also
-- where collectors older than this release keep reporting. Their devices and
-- limit samples are pointed at it, so the dashboard reads exactly as before
-- until an updated collector identifies itself and (if it is a second
-- subscription) splits off its own row.
--
-- The old user_settings limit columns are left in place, unread. Dropping
-- columns is a one-way migration.
--
-- No faithful rollback: which account a device belonged to is not recoverable
-- from the pre-migration state.
CREATE TABLE "claude_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"ext_id" text,
	"email" text,
	"org_name" text,
	"limit_source" text,
	"five_hour_pct" integer,
	"seven_day_pct" integer,
	"five_hour_resets_at" timestamp with time zone,
	"seven_day_resets_at" timestamp with time zone,
	"model_limits" jsonb,
	"limits_reported_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "claude_account_user_ext_uq" UNIQUE NULLS NOT DISTINCT("user_id","ext_id")
);
--> statement-breakpoint
ALTER TABLE "claude_account" ADD CONSTRAINT "claude_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "claude_account_id" text;--> statement-breakpoint
ALTER TABLE "limit_sample" ADD COLUMN "claude_account_id" text;--> statement-breakpoint
-- Carry the last reported limits over into the unidentified-account bucket.
-- Restricted to users that have a device, a sample, or a reading: a user who
-- never connected a collector should still land on the setup screen, not on an
-- empty account card.
INSERT INTO "claude_account" (
	"id", "user_id", "ext_id", "limit_source", "five_hour_pct", "seven_day_pct",
	"five_hour_resets_at", "seven_day_resets_at", "model_limits", "limits_reported_at"
)
SELECT gen_random_uuid()::text, u."id", NULL,
	s."limit_source", s."five_hour_pct", s."seven_day_pct",
	s."five_hour_resets_at", s."seven_day_resets_at", s."model_limits", s."limits_reported_at"
FROM "user" u
LEFT JOIN "user_settings" s ON s."user_id" = u."id"
WHERE EXISTS (SELECT 1 FROM "devices" d WHERE d."user_id" = u."id")
	OR EXISTS (SELECT 1 FROM "limit_sample" ls WHERE ls."user_id" = u."id")
	OR s."limits_reported_at" IS NOT NULL;
--> statement-breakpoint
UPDATE "devices" d SET "claude_account_id" = a."id" FROM "claude_account" a WHERE a."user_id" = d."user_id";--> statement-breakpoint
UPDATE "limit_sample" l SET "claude_account_id" = a."id" FROM "claude_account" a WHERE a."user_id" = l."user_id";--> statement-breakpoint
ALTER TABLE "limit_sample" ALTER COLUMN "claude_account_id" SET NOT NULL;--> statement-breakpoint
DROP INDEX "limit_sample_user_start_idx";--> statement-breakpoint
ALTER TABLE "limit_sample" DROP CONSTRAINT "limit_sample_user_id_window_window_start_pk";--> statement-breakpoint
ALTER TABLE "limit_sample" ADD CONSTRAINT "limit_sample_claude_account_id_window_window_start_pk" PRIMARY KEY("claude_account_id","window","window_start");--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_claude_account_id_claude_account_id_fk" FOREIGN KEY ("claude_account_id") REFERENCES "public"."claude_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_sample" ADD CONSTRAINT "limit_sample_claude_account_id_claude_account_id_fk" FOREIGN KEY ("claude_account_id") REFERENCES "public"."claude_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_claude_account_idx" ON "devices" USING btree ("claude_account_id");--> statement-breakpoint
CREATE INDEX "limit_sample_account_start_idx" ON "limit_sample" USING btree ("claude_account_id","window_start");
