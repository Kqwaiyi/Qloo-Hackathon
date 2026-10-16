CREATE TYPE "public"."preview_refusal_reason" AS ENUM('blocked', 'image_safety', 'no_image');--> statement-breakpoint
CREATE TYPE "public"."preview_state" AS ENUM('pending', 'ready', 'refused', 'failed');--> statement-breakpoint
-- Outfits from before Previews never had one made.
ALTER TABLE "outfit" ADD COLUMN "preview_state" "preview_state" DEFAULT 'failed' NOT NULL;--> statement-breakpoint
ALTER TABLE "outfit" ALTER COLUMN "preview_state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "outfit" ADD COLUMN "preview_pathname" text;--> statement-breakpoint
ALTER TABLE "outfit" ADD COLUMN "preview_refusal_reason" "preview_refusal_reason";--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_preview_pathname_when_ready" CHECK (("outfit"."preview_state" = 'ready') = ("outfit"."preview_pathname" is not null));--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_preview_refusal_reason_when_refused" CHECK (("outfit"."preview_state" = 'refused') = ("outfit"."preview_refusal_reason" is not null));