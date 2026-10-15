"use server";

import { redirect } from "next/navigation";

import { ROUTES } from "@/config/routes";
import { getOperationContext } from "@/server/app/context";
import { signOut } from "@/server/operations/sign-in";

export async function signOutAction(): Promise<void> {
  await signOut(await getOperationContext());
  redirect(ROUTES.home);
}
