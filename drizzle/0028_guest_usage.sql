CREATE TYPE "public"."guest_usage_kind" AS ENUM('guest_consultation', 'photo_check');--> statement-breakpoint
CREATE TABLE "guest_usage_record" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "guest_usage_kind" NOT NULL,
	"ip_hash" text NOT NULL,
	"used_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "guest_ip_hash" text;--> statement-breakpoint
CREATE INDEX "guest_usage_record_ip_hash_kind_used_at_idx" ON "guest_usage_record" USING btree ("ip_hash","kind","used_at");--> statement-breakpoint
CREATE INDEX "user_guest_ip_hash_idx" ON "user" USING btree ("guest_ip_hash");