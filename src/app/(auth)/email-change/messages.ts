import { EMAILS_PAUSED } from "@/components/messages";
import { COPY } from "@/config/copy";
import { AUTH_ERROR_CODES } from "@/server/auth/emails";

// Wording the spec doesn't fix, so it lives here rather than in COPY.

/**
 * Why an email-change link didn't work, by the error code it landed with, whatever its case: a cap
 * on the new address's link, or a link that has expired, been replaced or is broken.
 */
export function emailChangeLinkProblem(code: string): { heading: string; text: string } {
  switch (code.toUpperCase()) {
    case AUTH_ERROR_CODES.emailLimitReached:
      return { heading: "We can't send another link today", text: "Open the link we already sent to the new address, or try again tomorrow." };
    case AUTH_ERROR_CODES.emailsPaused:
      return { heading: "We can't send the link right now", text: EMAILS_PAUSED };
    default:
      return { heading: COPY.badLink, text: "A newer change, or one that's finished, stops the links of an earlier one." };
  }
}
