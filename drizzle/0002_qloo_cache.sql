CREATE TABLE "qloo_cache" (
	"request_key" text PRIMARY KEY NOT NULL,
	"body" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
