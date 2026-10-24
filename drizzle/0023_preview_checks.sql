CREATE TYPE "public"."preview_redraw_state" AS ENUM('pending', 'ready', 'refused', 'failed', 'kept');--> statement-breakpoint
ALTER TYPE "public"."preview_refusal_reason" ADD VALUE 'not_kept';--> statement-breakpoint
ALTER TABLE "outfit" ADD COLUMN "preview_redraw" "preview_redraw_state";