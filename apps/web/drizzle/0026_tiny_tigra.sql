CREATE TABLE "project_merge" (
	"name" text NOT NULL,
	"path" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "project_merge_user_id_path_pk" PRIMARY KEY("user_id","path")
);
--> statement-breakpoint
ALTER TABLE "project_merge" ADD CONSTRAINT "project_merge_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;