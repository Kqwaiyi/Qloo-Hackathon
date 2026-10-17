ALTER TABLE "user" ADD COLUMN "accepted_photo_notice_version" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "photo_notice_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_photo_notice_accepted_together" CHECK (("user"."accepted_photo_notice_version" is null) = ("user"."photo_notice_accepted_at" is null));