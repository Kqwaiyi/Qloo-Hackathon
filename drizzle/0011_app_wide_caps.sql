CREATE TABLE "qloo_limit_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"remaining_calls" integer NOT NULL,
	"resets_at" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "qloo_limit_state_one_row" CHECK ("qloo_limit_state"."id" = 1)
);
--> statement-breakpoint
CREATE INDEX "usage_record_kind_used_at_idx" ON "usage_record" USING btree ("kind","used_at");