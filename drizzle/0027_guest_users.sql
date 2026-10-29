ALTER TABLE "user" ALTER COLUMN "birth_year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "birth_month" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_guest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "age_group" "age_group";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_birth_date_or_guest_age_group" CHECK ("user"."is_guest" = ("user"."birth_year" is null) and "user"."is_guest" = ("user"."birth_month" is null) and "user"."is_guest" = ("user"."age_group" is not null));