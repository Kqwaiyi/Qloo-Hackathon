ALTER TABLE "outfit" ADD COLUMN "top_brand_entity_id" text;--> statement-breakpoint
ALTER TABLE "outfit" ADD COLUMN "bottom_brand_entity_id" text;--> statement-breakpoint
ALTER TABLE "outfit" ADD COLUMN "shoes_brand_entity_id" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "brand_entity_id" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "brand_name" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "brand_official_site" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "brand_price_usd_min" double precision;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "brand_price_usd_max" double precision;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_brand_picks_together" CHECK (("outfit"."top_brand_entity_id" is null) = ("outfit"."bottom_brand_entity_id" is null) and ("outfit"."bottom_brand_entity_id" is null) = ("outfit"."shoes_brand_entity_id" is null));--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_brand_unless_hairstyle" CHECK (("piece"."category" = 'hairstyle') = ("piece"."brand_entity_id" is null) and ("piece"."brand_entity_id" is null) = ("piece"."brand_name" is null));