CREATE TABLE "console_spend" (
	"spend" jsonb NOT NULL,
	"synced_at" timestamp with time zone NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "console_spend" ADD CONSTRAINT "console_spend_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;