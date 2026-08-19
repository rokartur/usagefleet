ALTER TABLE "limit_change_point" ADD COLUMN IF NOT EXISTS "model" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "limit_change_point" DROP CONSTRAINT IF EXISTS "limit_change_point_claude_account_id_window_at_pk";--> statement-breakpoint
ALTER TABLE "limit_change_point" DROP CONSTRAINT IF EXISTS "limit_change_point_claude_account_id_window_model_at_pk";--> statement-breakpoint
ALTER TABLE "limit_change_point" ADD CONSTRAINT "limit_change_point_claude_account_id_window_model_at_pk" PRIMARY KEY("claude_account_id","window","model","at");
