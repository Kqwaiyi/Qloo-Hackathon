"use server";

import { redirect } from "next/navigation";

import { APP_HOME } from "@/config/routes";
import { getOperationContext } from "@/server/app/context";
import { signIn, type SignInInput, signInInputSchema } from "@/server/operations/sign-in";

export async function signInAction(input: SignInInput) {
  const result = await signIn(await getOperationContext(), signInInputSchema.parse(input));
  if (result.ok) redirect(APP_HOME);
  return result;
}
