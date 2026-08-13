ALTER TABLE "groups" ADD COLUMN "block_on_session_limit" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "block_on_weekly_limit" boolean DEFAULT false NOT NULL;