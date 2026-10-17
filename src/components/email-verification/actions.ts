"use server";

import { getOperationContext } from "@/server/app/context";
import { resendVerificationEmail } from "@/server/operations/email-verification";

/** "Resend link" in the verification banner, or "Send a new link" after a link that didn't work. */
export async function resendVerificationAction() {
  return resendVerificationEmail(await getOperationContext());
}
