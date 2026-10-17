import type { Metadata } from "next";

import { BadResetLink } from "./bad-reset-link";
import { ResetPasswordForm } from "./reset-password-form";

// The token is in this page's address, so no link out of it should pass the address on.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

/**
 * Where Better Auth sends a reset link once it has checked it: with the token if it still works,
 * or with an error if not. Open to anyone, signed in or not.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token, error } = await searchParams;
  if (error !== undefined || typeof token !== "string" || !token) return <BadResetLink />;
  return <ResetPasswordForm token={token} />;
}
