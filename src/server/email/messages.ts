import {
  PASSWORD_RESET_LINK_LIFETIME_SECONDS,
  UNVERIFIED_ACCOUNT_LIFETIME_DAYS,
  VERIFICATION_LINK_LIFETIME_SECONDS,
} from "@/config/accounts";
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

/**
 * The notice after a password change, so the user hears about a change they didn't make. A reset
 * sends none: the reset email already went to the same address.
 */
export function passwordChangedEmail({ forgotPasswordLink, teamEmail }: { forgotPasswordLink: string; teamEmail: string }): EmailContent {
  return {
    subject: "Your Outfit Recommender password was changed",
    text: [
      "The password for your Outfit Recommender account was just changed, and your other devices were signed out.",
      "If you didn't change it, reset your password now:",
      forgotPasswordLink,
      `Then email us at ${teamEmail} so we can help secure your account.`,
    ].join("\n\n"),
  };
}

/**
 * To a verified user's old address, which approves a change before the new address hears of it.
 * It doubles as the notice that the email is changing.
 */
export function emailChangeApprovalEmail({
  newEmail,
  link,
  forgotPasswordLink,
  teamEmail,
}: {
  newEmail: string;
  link: string;
  forgotPasswordLink: string;
  teamEmail: string;
}): EmailContent {
  const hours = VERIFICATION_LINK_LIFETIME_SECONDS / 3600;
  return {
    subject: "Approve your new email for Outfit Recommender",
    text: [
      `Someone asked to change the email for your Outfit Recommender account to ${newEmail}.`,
      "If it was you, approve the change with this link:",
      link,
      `The link works for ${hours} hours. Once you approve, we'll send a link to ${newEmail}, and the change is done when it's opened there.`,
      "If it wasn't you, don't open the link, and your email stays as it is. Someone may know your password, so reset it now:",
      forgotPasswordLink,
      `Then email us at ${teamEmail} so we can help secure your account.`,
    ].join("\n\n"),
  };
}

/** To the new address, once the old one has approved the change: the link that finishes it. */
export function emailChangeVerificationEmail({ link }: { link: string }): EmailContent {
  const hours = VERIFICATION_LINK_LIFETIME_SECONDS / 3600;
  return {
    subject: "Confirm your new email for Outfit Recommender",
    text: [
      "To finish changing your Outfit Recommender email to this address, open this link:",
      link,
      `The link works for ${hours} hours.`,
      "Didn't ask for this? Ignore this email and nothing changes.",
    ].join("\n\n"),
  };
}

/** The password reset link, for whoever asked for one with this account's address. */
export function passwordResetEmail({ link }: { link: string }): EmailContent {
  const hours = PASSWORD_RESET_LINK_LIFETIME_SECONDS / 3600;
  return {
    subject: "Reset your Outfit Recommender password",
    text: [
      "To choose a new password for your Outfit Recommender account, open this link:",
      link,
      `The link works for ${hours} ${hours === 1 ? "hour" : "hours"}. Resetting your password signs you out on every device.`,
      "Didn't ask for this? Ignore this email and nothing changes.",
    ].join("\n\n"),
  };
}
