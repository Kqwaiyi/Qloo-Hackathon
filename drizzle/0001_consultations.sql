CREATE TYPE "public"."age_group" AS ENUM('18_24', '25_29', '30_34', '35_44', '45_54', '55_64', '65_plus');--> statement-breakpoint
CREATE TYPE "public"."budget_tier" AS ENUM('no_budget', 'low', 'medium', 'expensive');--> statement-breakpoint
CREATE TYPE "public"."photo_type" AS ENUM('face', 'full_body', 'body_only');--> statement-breakpoint
CREATE TABLE "consultation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"photo_type" "photo_type" NOT NULL,
	"photo_pathname" text NOT NULL,
	"face_visible" boolean NOT NULL,
	"hair_visible" boolean NOT NULL,
	"upper_body_visible" boolean NOT NULL,
	"legs_visible" boolean NOT NULL,
	"feet_visible" boolean NOT NULL,
	"hair_covered" boolean NOT NULL,
	"photo_style" text[] NOT NULL,
	"budget_tier" "budget_tier",
	"style_preference" "style_preference" NOT NULL,
	"country_code" text NOT NULL,
	"age_group" "age_group" NOT NULL,
	CONSTRAINT "consultation_photo_style_words" CHECK (cardinality("consultation"."photo_style") between 1 and 2),
	CONSTRAINT "consultation_budget_tier_for_body_photos" CHECK (("consultation"."photo_type" = 'face') = ("consultation"."budget_tier" is null))
);
--> statement-breakpoint
ALTER TABLE "consultation" ADD CONSTRAINT "consultation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consultation_user_id_created_at_idx" ON "consultation" USING btree ("user_id","created_at");