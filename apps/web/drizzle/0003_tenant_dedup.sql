DROP INDEX "usage_event_uuid_uq";--> statement-breakpoint
DROP INDEX "usage_event_msg_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "usage_event_user_uuid_uq" ON "usage_event" USING btree ("user_id","uuid");