import { EMAILS_PAUSED, RATE_LIMITED } from "@/components/messages";
import { PER_ACCOUNT_EMAIL_CAPS } from "@/config/email";
import type { ResendVerificationRefusal } from "@/server/operations/email-verification";

// Wording the spec doesn't fix, so it lives here rather than in COPY.

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
