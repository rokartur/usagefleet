CREATE TABLE "limit_change_point" (
	"at" timestamp with time zone NOT NULL,
	"claude_account_id" text NOT NULL,
	"pct" real NOT NULL,
	"user_id" text NOT NULL,
	"window" text NOT NULL,
	CONSTRAINT "limit_change_point_claude_account_id_window_at_pk" PRIMARY KEY("claude_account_id","window","at")
);
--> statement-breakpoint
ALTER TABLE "limit_change_point" ADD CONSTRAINT "limit_change_point_claude_account_id_claude_account_id_fk" FOREIGN KEY ("claude_account_id") REFERENCES "public"."claude_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "limit_change_point" ADD CONSTRAINT "limit_change_point_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;