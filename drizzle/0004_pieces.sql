CREATE TYPE "public"."category" AS ENUM('hairstyle', 'top', 'bottom', 'shoes');--> statement-breakpoint
CREATE TABLE "piece" (
	"id" text PRIMARY KEY NOT NULL,
	"outfit_id" text NOT NULL,
	"category" "category" NOT NULL,
	"item" text NOT NULL,
	"details" text NOT NULL,
	"why" text NOT NULL,
	"unknown_cut" boolean,
	CONSTRAINT "piece_outfit_id_category_unique" UNIQUE("outfit_id","category"),
	CONSTRAINT "piece_unknown_cut_for_hairstyles" CHECK (("piece"."category" = 'hairstyle') = ("piece"."unknown_cut" is not null))
);
--> statement-breakpoint
-- Stylings from before tailoring never had a tailoring fail.
ALTER TABLE "styling" ADD COLUMN "tailoring_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "styling" ALTER COLUMN "tailoring_failures" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "piece" ADD CONSTRAINT "piece_outfit_id_outfit_id_fk" FOREIGN KEY ("outfit_id") REFERENCES "public"."outfit"("id") ON DELETE cascade ON UPDATE no action;