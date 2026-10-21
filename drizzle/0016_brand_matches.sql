CREATE TABLE "brand_match" (
	"qloo_entity_id" text PRIMARY KEY NOT NULL,
	"product_search_brand_id" text,
	"looked_up_at" timestamp with time zone NOT NULL
);
