CREATE TABLE "piece_candidates" (
	"styling_id" text NOT NULL,
	"style_icon_id" text NOT NULL,
	"category" "category" NOT NULL,
	"brand_entity_id" text NOT NULL,
	"candidates" jsonb NOT NULL,
	"searched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "piece_candidates_pk" PRIMARY KEY("styling_id","style_icon_id","category","brand_entity_id")
);
--> statement-breakpoint
ALTER TABLE "piece" ALTER COLUMN "details" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "product_id" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "product_photo_url" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "offer_url" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "offer_shop_domain" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "price" double precision;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "market" text;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "priced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "piece" ADD COLUMN "available" boolean;--> statement-breakpoint
ALTER TABLE "styling" ADD COLUMN "market" text;--> statement-breakpoint
ALTER TABLE "piece_candidates" ADD CONSTRAINT "piece_candidates_styling_id_styling_id_fk" FOREIGN KEY ("styling_id") REFERENCES "public"."styling"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_candidates" ADD CONSTRAINT "piece_candidates_style_icon_id_style_icon_id_fk" FOREIGN KEY ("style_icon_id") REFERENCES "public"."style_icon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_product_fields_together" CHECK (num_nonnulls("piece"."product_id", "piece"."product_photo_url", "piece"."offer_url", "piece"."offer_shop_domain", "piece"."price", "piece"."currency", "piece"."market", "piece"."priced_at", "piece"."available") in (0, 9)
        and ("piece"."product_id" is null) = ("piece"."details" is not null)
        and ("piece"."product_id" is null or "piece"."brand_entity_id" is not null));