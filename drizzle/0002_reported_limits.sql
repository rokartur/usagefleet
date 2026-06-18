ALTER TABLE "user_settings" ADD COLUMN "limit_source" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "five_hour_pct" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "seven_day_pct" integer;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "five_hour_resets_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "seven_day_resets_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_settings" ADD COLUMN "limits_reported_at" timestamp with time zone;