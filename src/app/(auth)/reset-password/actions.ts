"use server";

import { redirect } from "next/navigation";

import { PASSWORD_RESET_ROUTE } from "@/config/routes";
import { getOperationContext } from "@/server/app/context";
import { type ResetPasswordRefusal, resetPassword } from "@/server/operations/password-reset";

export interface ResetPasswordState {
  refusal: ResetPasswordRefusal["refusal"] | null;
}

/** Sets the new password, then sends the user to sign in with it: the reset signed them out everywhere. */
export async function resetPasswordAction(_previous: ResetPasswordState, formData: FormData): Promise<ResetPasswordState> {
  const result = await resetPassword(await getOperationContext(), {
    token: String(formData.get("token") ?? ""),
    newPassword: String(formData.get("newPassword") ?? ""),
  });
  if (result.ok) redirect(PASSWORD_RESET_ROUTE);
  return { refusal: result.refusal };
}
