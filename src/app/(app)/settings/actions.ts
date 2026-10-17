"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { ACCOUNT_DELETED_ROUTE, ROUTES, SIGNED_OUT_EVERYWHERE_ROUTE } from "@/config/routes";
import { getOperationContext } from "@/server/app/context";
import { type ProfileInput, profileInputSchema } from "@/server/accounts/profile";
import {
  type ChangePasswordInput,
  changePassword,
  changePasswordInputSchema,
  type DeleteAccountInput,
  deleteAccount,
  deleteAccountInputSchema,
  signOutEverywhere,
  updateProfile,
  withdrawPhotoConsent,
} from "@/server/operations/account";

/** Settings → Profile → Save. The page then shows the saved profile. */
export async function updateProfileAction(input: ProfileInput) {
  const result = await updateProfile(await getOperationContext(), profileInputSchema.parse(input));
  if (result.ok) refresh();
  else if (result.refusal === "signed-out") redirect(ROUTES.signIn);
  return result;
}

/** Settings → Sign-in → Change password. This device stays signed in, with a new session cookie. */
export async function changePasswordAction(input: ChangePasswordInput) {
  const result = await changePassword(await getOperationContext(), changePasswordInputSchema.parse(input));
  if (!result.ok && result.refusal === "signed-out") redirect(ROUTES.signIn);
  return result;
}

/** Settings → Privacy → "Withdraw photo consent", once confirmed. Pages then show no Consultations. */
export async function withdrawPhotoConsentAction() {
  const result = await withdrawPhotoConsent(await getOperationContext());
  if (result.ok) refresh();
  else if (result.refusal === "signed-out") redirect(ROUTES.signIn);
  return result;
}

/** "Sign out of all devices", with no confirmation. This device is signed out too, so it lands on sign-in. */
export async function signOutEverywhereAction(): Promise<void> {
  const result = await signOutEverywhere(await getOperationContext());
  redirect(result.ok ? SIGNED_OUT_EVERYWHERE_ROUTE : ROUTES.signIn);
}

/** Settings → Danger → "Delete account", given the password. Deleted, the user lands on the landing page, signed out. */
export async function deleteAccountAction(input: DeleteAccountInput) {
  const result = await deleteAccount(await getOperationContext(), deleteAccountInputSchema.parse(input));
  if (result.ok) redirect(ACCOUNT_DELETED_ROUTE);
  if (result.refusal === "signed-out") redirect(ROUTES.signIn);
  return result;
}
