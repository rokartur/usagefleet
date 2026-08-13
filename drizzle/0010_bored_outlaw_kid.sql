CREATE TABLE "limit_sample" (
	"user_id" text NOT NULL,
	"window" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"peak_pct" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "limit_sample_user_id_window_window_start_pk" PRIMARY KEY("user_id","window","window_start")
);
--> statement-breakpoint
ALTER TABLE "limit_sample" ADD CONSTRAINT "limit_sample_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "limit_sample_user_start_idx" ON "limit_sample" USING btree ("user_id","window_start");