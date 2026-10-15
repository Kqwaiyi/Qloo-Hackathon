"use server";

import { redirect } from "next/navigation";

import { APP_HOME } from "@/config/routes";
import { getOperationContext } from "@/server/app/context";
import { signIn } from "@/server/operations/sign-in";

export interface SignInState {
  identifier: string;
  failed: boolean;
}

export async function signInAction(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get("identifier") ?? "");
  const result = await signIn(await getOperationContext(), { identifier, password: String(formData.get("password") ?? "") });
  if (result.ok) redirect(APP_HOME);
  return { identifier, failed: true };
}
