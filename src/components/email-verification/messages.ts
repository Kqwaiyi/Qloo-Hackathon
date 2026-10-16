import { PER_ACCOUNT_EMAIL_CAPS } from "@/config/email";
import type { ChangeUnverifiedEmailRefusal, ResendVerificationRefusal } from "@/server/operations/email-verification";

// Wording the spec doesn't fix, so it lives here rather than in COPY.
const EMAILS_PAUSED = "We can't send emails right now. Please try again tomorrow.";
const RATE_LIMITED = "Please wait a moment and try again.";

/** What "Resend link" says when it can't send. Signed-out and verified users are sent elsewhere instead. */
export function resendProblem(refusal: Exclude<ResendVerificationRefusal["refusal"], "signed-out" | "already-verified">): string {
  switch (refusal) {
    case "resend-limit":
      return `You've asked for ${PER_ACCOUNT_EMAIL_CAPS["verification-resend"]} new links today. Try again tomorrow.`;
    case "emails-paused":
      return EMAILS_PAUSED;
    case "rate-limited":
      return RATE_LIMITED;
  }
}

/** What "Change email" says when it can't change it. Signed-out and verified users are sent elsewhere instead. */
export function changeEmailProblem(refusal: Exclude<ChangeUnverifiedEmailRefusal["refusal"], "signed-out" | "already-verified">): string {
  switch (refusal) {
    case "invalid-email":
      return "Enter a valid email address.";
    case "same-email":
      return "That's the address we already sent the link to.";
    case "change-limit":
      return `You've changed your email ${PER_ACCOUNT_EMAIL_CAPS["email-change"]} times today. Try again tomorrow.`;
    case "emails-paused":
      return EMAILS_PAUSED;
    case "rate-limited":
      return RATE_LIMITED;
  }
}
