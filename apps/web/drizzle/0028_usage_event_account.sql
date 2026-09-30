ALTER TABLE "usage_event" ADD COLUMN "claude_account_id" text;--> statement-breakpoint
ALTER TABLE "usage_event" ADD CONSTRAINT "usage_event_claude_account_id_claude_account_id_fk" FOREIGN KEY ("claude_account_id") REFERENCES "public"."claude_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Rows before this migration take the account their device is on now, which is
-- what every query read until today, so no existing number moves.
UPDATE "usage_event" AS e SET "claude_account_id" = d."claude_account_id" FROM "devices" AS d WHERE d."id" = e."device_id" AND d."claude_account_id" IS NOT NULL;
