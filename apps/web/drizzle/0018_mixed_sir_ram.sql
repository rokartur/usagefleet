ALTER TABLE "claude_account" ALTER COLUMN "five_hour_pct" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "claude_account" ALTER COLUMN "seven_day_pct" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "limit_sample" ALTER COLUMN "peak_pct" SET DATA TYPE real;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "cache_creation_5m_tokens" integer;--> statement-breakpoint
ALTER TABLE "usage_event" ADD COLUMN "cache_creation_1h_tokens" integer;