"use server";

import { getOperationContext } from "@/server/app/context";
import { type RequestPasswordResetRefusal, requestPasswordReset } from "@/server/operations/password-reset";

export interface ForgotPasswordState {
  email: string;
  /** How the last request went: sent (as far as anyone can tell), refused, or not asked yet. */
  outcome: "sent" | RequestPasswordResetRefusal["refusal"] | null;
}

export async function requestPasswordResetAction(_previous: ForgotPasswordState, formData: FormData): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "");
  const result = await requestPasswordReset(await getOperationContext(), email);
  return { email, outcome: result.ok ? "sent" : result.refusal };
}
