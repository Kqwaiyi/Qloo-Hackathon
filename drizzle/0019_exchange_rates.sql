CREATE TABLE "exchange_rate" (
	"currency" text PRIMARY KEY NOT NULL,
	"rate_per_usd" double precision NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "exchange_rate_positive" CHECK ("exchange_rate"."rate_per_usd" > 0)
);
