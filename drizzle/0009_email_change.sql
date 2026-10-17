CREATE TYPE "public"."email_change_step" AS ENUM('approval', 'verification');--> statement-breakpoint
CREATE TABLE "email_change" (
	"user_id" text PRIMARY KEY NOT NULL,
	"new_email" text NOT NULL,
	"step" "email_change_step" NOT NULL,
	"link_sent_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_change" ADD CONSTRAINT "email_change_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;