ALTER TABLE "usage_event" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Rows before this migration take the group their device is in now, which is
-- what every query read until today, so no existing number moves.
-- shortcut: only rows an open window can hold (weekly = 7 days). All 1.6M rows took
-- 83 s on a test box while the app waits on migrations; older rows stay NULL and
-- read their device's current group as before. Stamp them in batches if that matters.
UPDATE "usage_event" AS e SET "group_id" = d."group_id" FROM "devices" AS d WHERE d."id" = e."device_id" AND d."group_id" IS NOT NULL AND e."ts" >= now() - interval '8 days';