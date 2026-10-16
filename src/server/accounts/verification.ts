import { UNVERIFIED_ACCOUNT_LIFETIME_DAYS } from "@/config/accounts";

/** When an account still unverified is deleted: 7 days after sign-up, whatever its email changes. */
export function unverifiedAccountDeletionDate(createdAt: Date): Date {
  return new Date(createdAt.getTime() + UNVERIFIED_ACCOUNT_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * The deletion date as the verification email and the banner both write it, such as "23 October
 * 2026". An email can't know the reader's time zone, so both give the UTC date and agree.
 */
export function deletionDateText(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
