import { EMAILS_PAUSED, INVALID_EMAIL, RATE_LIMITED } from "@/components/messages";
import type { EmailChangeStep } from "@/config/accounts";
import { COPY } from "@/config/copy";
import { PER_ACCOUNT_EMAIL_CAPS } from "@/config/email";
import type { PendingEmailChange } from "@/server/accounts/email-change";
import type { ChangeEmailRefusal } from "@/server/operations/email-change";

// Wording the spec doesn't fix, so it lives here rather than in COPY.

/**
 * What "Change email" says once asked, the same whether or not the address is already in use. An
 * unverified user's address has changed, and the new one has its link: the spec's line. A verified
 * user's old address has the approval link instead, so the spec's line would be untrue there; this
 * one keeps its condition and names where the link went.
 */
export function emailChangeAnswer(awaiting: EmailChangeStep, currentEmail: string): string {
  if (awaiting === "verification") return COPY.emailChangeSent;
  return `If that address isn't already in use, we've sent a link to ${currentEmail} to approve the change.`;
}

/** What "Change email" says when it can't change it. A signed-out user is sent to sign in instead. */
export function changeEmailProblem(refusal: Exclude<ChangeEmailRefusal["refusal"], "signed-out">): string {
  switch (refusal) {
    case "invalid-email":
      return INVALID_EMAIL;
    case "same-email":
      return "That's already your email.";
    case "disposable-address":
      return COPY.disposableAddress;
    case "change-limit":
      return `You can change your email ${PER_ACCOUNT_EMAIL_CAPS["email-change"]} times a day. Try again tomorrow.`;
    case "emails-paused":
      return EMAILS_PAUSED;
    case "rate-limited":
      return RATE_LIMITED;
    case "managed-by-the-team":
      return COPY.managedByTheTeam;
  }
}

/** Settings → Sign-in: the step a verified user's email change waits on, and where its link went. */
export function pendingEmailChangeText({ newEmail, step }: PendingEmailChange, currentEmail: string): string {
  switch (step) {
    case "approval":
      return `Changing to ${newEmail}. Step 1 of 2: approve it with the link we sent to ${currentEmail}.`;
    case "verification":
      return `Changing to ${newEmail}. Step 2 of 2: open the link we sent there to finish.`;
  }
}
