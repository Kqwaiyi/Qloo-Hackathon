"use server";

import { refresh } from "next/cache";
import * as z from "zod";

import { getOperationContext } from "@/server/app/context";
import { changeUnverifiedEmail, resendVerificationEmail } from "@/server/operations/email-verification";

/** "Resend link" in the verification banner, or "Send a new link" after a link that didn't work. */
export async function resendVerificationAction() {
  return resendVerificationEmail(await getOperationContext());
}

/** "Change email" in the verification banner. The banner then shows the new address. */
export async function changeUnverifiedEmailAction(newEmail: string) {
  const result = await changeUnverifiedEmail(await getOperationContext(), z.string().parse(newEmail));
  if (result.ok) refresh();
  return result;
}
