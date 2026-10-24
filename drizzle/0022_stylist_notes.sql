CREATE TYPE "public"."stylist_note_kind" AS ENUM('note', 'step');--> statement-breakpoint
CREATE TABLE "stylist_note" (
	"styling_id" text NOT NULL,
	"position" integer NOT NULL,
	"kind" "stylist_note_kind" NOT NULL,
	"text" text NOT NULL,
	"turn" integer,
	CONSTRAINT "stylist_note_pk" PRIMARY KEY("styling_id","position"),
	CONSTRAINT "stylist_note_turn_for_notes" CHECK (("stylist_note"."kind" = 'note') = ("stylist_note"."turn" is not null))
);
--> statement-breakpoint
ALTER TABLE "stylist_note" ADD CONSTRAINT "stylist_note_styling_id_styling_id_fk" FOREIGN KEY ("styling_id") REFERENCES "public"."styling"("id") ON DELETE cascade ON UPDATE no action;