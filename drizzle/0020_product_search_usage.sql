ALTER TYPE "public"."usage_kind" ADD VALUE 'product_search';--> statement-breakpoint
ALTER TABLE "styling" ADD COLUMN "product_searches" integer DEFAULT 0 NOT NULL;