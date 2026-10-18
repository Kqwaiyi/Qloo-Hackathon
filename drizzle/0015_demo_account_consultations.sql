DROP INDEX "styling_running_per_user_unique";--> statement-breakpoint
ALTER TABLE "consultation" ADD COLUMN "accepted_photo_notice_version" integer;--> statement-breakpoint
ALTER TABLE "consultation" ADD COLUMN "photo_notice_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "styling" ADD COLUMN "on_demo_account" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "styling_running_per_user_unique" ON "styling" USING btree ("user_id") WHERE "styling"."status" = 'running' and not "styling"."on_demo_account";--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_photo_notice_accepted_together" CHECK (("consultation"."accepted_photo_notice_version" is null) = ("consultation"."photo_notice_accepted_at" is null));