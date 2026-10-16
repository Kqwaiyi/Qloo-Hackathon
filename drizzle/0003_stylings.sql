CREATE TYPE "public"."consultation_state" AS ENUM('styling', 'ready', 'no_outfits');--> statement-breakpoint
CREATE TYPE "public"."outfit_line" AS ENUM('womenswear', 'menswear');--> statement-breakpoint
CREATE TYPE "public"."style_icon_status" AS ENUM('unused', 'used', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."styling_failure_reason" AS ENUM('nothing_built', 'something_broke');--> statement-breakpoint
CREATE TYPE "public"."styling_kind" AS ENUM('first', 'more', 'budget_tier_change', 'photo_style_change', 'try_again');--> statement-breakpoint
CREATE TYPE "public"."styling_stage" AS ENUM('style_icons', 'brands', 'building_outfits', 'previews');--> statement-breakpoint
CREATE TYPE "public"."styling_status" AS ENUM('running', 'succeeded', 'failed');--> statement-breakpoint
CREATE TABLE "outfit" (
	"id" text PRIMARY KEY NOT NULL,
	"consultation_id" text NOT NULL,
	"styling_id" text NOT NULL,
	"position" integer NOT NULL,
	"style_icon_id" text NOT NULL,
	"current" boolean NOT NULL,
	CONSTRAINT "outfit_styling_id_position_unique" UNIQUE("styling_id","position")
);
--> statement-breakpoint
CREATE TABLE "style_icon" (
	"id" text PRIMARY KEY NOT NULL,
	"consultation_id" text NOT NULL,
	"styling_id" text NOT NULL,
	"position" integer NOT NULL,
	"qloo_entity_id" text NOT NULL,
	"name" text NOT NULL,
	"line" "outfit_line" NOT NULL,
	"status" "style_icon_status" NOT NULL,
	CONSTRAINT "style_icon_styling_id_position_unique" UNIQUE("styling_id","position"),
	CONSTRAINT "style_icon_styling_id_qloo_entity_id_unique" UNIQUE("styling_id","qloo_entity_id")
);
--> statement-breakpoint
CREATE TABLE "styling" (
	"id" text PRIMARY KEY NOT NULL,
	"consultation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" "styling_kind" NOT NULL,
	"budget_tier" "budget_tier",
	"photo_style" text[] NOT NULL,
	"status" "styling_status" NOT NULL,
	"stage" "styling_stage" NOT NULL,
	"stage_moved_at" timestamp with time zone NOT NULL,
	"outfits_wanted" integer NOT NULL,
	"outfits_made" integer NOT NULL,
	"failure_reason" "styling_failure_reason",
	"workflow_run_id" text,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "styling_photo_style_words" CHECK (cardinality("styling"."photo_style") between 1 and 2),
	CONSTRAINT "styling_finished_unless_running" CHECK (("styling"."status" = 'running') = ("styling"."finished_at" is null)),
	CONSTRAINT "styling_failure_reason_when_failed" CHECK (("styling"."status" = 'failed') = ("styling"."failure_reason" is not null))
);
--> statement-breakpoint
-- Consultations from before Stylings existed never had Outfits built.
ALTER TABLE "consultation" ADD COLUMN "state" "consultation_state" DEFAULT 'no_outfits' NOT NULL;--> statement-breakpoint
ALTER TABLE "consultation" ALTER COLUMN "state" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_consultation_id_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_styling_id_styling_id_fk" FOREIGN KEY ("styling_id") REFERENCES "public"."styling"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outfit" ADD CONSTRAINT "outfit_style_icon_id_style_icon_id_fk" FOREIGN KEY ("style_icon_id") REFERENCES "public"."style_icon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_icon" ADD CONSTRAINT "style_icon_consultation_id_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "style_icon" ADD CONSTRAINT "style_icon_styling_id_styling_id_fk" FOREIGN KEY ("styling_id") REFERENCES "public"."styling"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "styling" ADD CONSTRAINT "styling_consultation_id_consultation_id_fk" FOREIGN KEY ("consultation_id") REFERENCES "public"."consultation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "styling" ADD CONSTRAINT "styling_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outfit_consultation_id_idx" ON "outfit" USING btree ("consultation_id");--> statement-breakpoint
CREATE INDEX "styling_consultation_id_idx" ON "styling" USING btree ("consultation_id");