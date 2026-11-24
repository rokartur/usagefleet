CREATE TABLE "anthropic_admin_key" (
	"ciphertext" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hint" text NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anthropic_admin_key" ADD CONSTRAINT "anthropic_admin_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;