import { UNVERIFIED_ACCOUNT_LIFETIME_DAYS, VERIFICATION_LINK_LIFETIME_SECONDS } from "@/config/accounts";
import { COPY } from "@/config/copy";
import { deletionDateText } from "@/server/accounts/verification";

/** The subject and plain text of one email. */
export interface EmailContent {
  subject: string;
  text: string;
}

/** The verification link, at sign-up, when asked for again, or after an unverified user's email change. */
export function verificationEmail({ link, deletionDate }: { link: string; deletionDate: Date }): EmailContent {
  const date = deletionDateText(deletionDate);
  const hours = VERIFICATION_LINK_LIFETIME_SECONDS / 3600;
  return {
    subject: "Verify your email for Outfit Recommender",
    text: [
      "Verify your email to start your first Consultation on Outfit Recommender:",
      link,
      `The link works for ${hours} hours. Unverified accounts are deleted ${UNVERIFIED_ACCOUNT_LIFETIME_DAYS} days after sign-up, so this one will be deleted on ${date} unless you verify it.`,
      COPY.didNotSignUp(date),
    ].join("\n\n"),
  };
}
