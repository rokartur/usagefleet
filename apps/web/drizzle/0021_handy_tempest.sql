ALTER TABLE "devices" ADD COLUMN "clock_offset_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "clock_offset_ms" integer;