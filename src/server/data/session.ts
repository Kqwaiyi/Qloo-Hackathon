import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { ROUTES } from "@/config/routes";
import { getReadContext } from "@/server/app/context";
import { type EmailVerification, readEmailVerification } from "@/server/operations/email-verification";
import { readSignedInUser, type SignedInUser } from "@/server/operations/session";

/** The signed-in user for this request, or null. Read once per request. */
export const getSignedInUser = cache(async (): Promise<SignedInUser | null> => readSignedInUser(await getReadContext()));

/** The signed-in user, sending anyone else to sign-in. */
export async function requireSignedInUser(): Promise<SignedInUser> {
  const user = await getSignedInUser();
  if (!user) redirect(ROUTES.signIn);
  return user;
}

/** Whether the signed-in user has verified their email, and if not, what the banner says. Null when signed out. Read once per request. */
export const getEmailVerification = cache(
  async (): Promise<EmailVerification | null> => readEmailVerification(await getReadContext()),
);
