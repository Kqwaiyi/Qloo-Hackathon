CREATE TYPE "public"."piece_search_state" AS ENUM('searching', 'answered', 'unanswered');--> statement-breakpoint
CREATE TABLE "style_icon_brands" (
	"styling_id" text NOT NULL,
	"style_icon_id" text NOT NULL,
	"brands" jsonb,
	CONSTRAINT "style_icon_brands_pk" PRIMARY KEY("styling_id","style_icon_id")
);
--> statement-breakpoint
ALTER TABLE "outfit" ADD COLUMN "top_brand_name" text;--> statement-breakpoint
ALTER TABLE "outfit" ADD COLUMN "bottom_brand_name" text;--> statement-breakpoint
ALTER TABLE "outfit" ADD COLUMN "shoes_brand_name" text;--> statement-breakpoint
ALTER TABLE "piece_candidates" ADD COLUMN "state" "piece_search_state";--> statement-breakpoint
UPDATE "piece_candidates" SET "state" = CASE WHEN "candidates" IS NULL THEN 'unanswered'::"piece_search_state" ELSE 'answered'::"piece_search_state" END;--> statement-breakpoint
ALTER TABLE "piece_candidates" ALTER COLUMN "state" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "style_icon_brands" ADD CONSTRAINT "style_icon_brands_styling_id_styling_id_fk" FOREIGN KEY ("styling_id") REFERENCES "public"."styling"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_icon_brands" ADD CONSTRAINT "style_icon_brands_style_icon_id_style_icon_id_fk" FOREIGN KEY ("style_icon_id") REFERENCES "public"."style_icon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "styling" DROP COLUMN "tailoring_failures";--> statement-breakpoint
ALTER TABLE "piece_candidates" ADD CONSTRAINT "piece_candidates_when_answered" CHECK (("piece_candidates"."state" = 'answered') = ("piece_candidates"."candidates" is not null));