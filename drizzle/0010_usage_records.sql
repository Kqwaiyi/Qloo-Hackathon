CREATE TYPE "public"."usage_kind" AS ENUM('outfit', 'photo_check');--> statement-breakpoint
CREATE TABLE "usage_record" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "usage_kind" NOT NULL,
	"user_id" text,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_record" ADD CONSTRAINT "usage_record_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_record_user_id_kind_used_at_idx" ON "usage_record" USING btree ("user_id","kind","used_at");