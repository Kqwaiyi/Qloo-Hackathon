import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { successNotice, textLink } from "@/components/ui";
import { APP_HOME, PASSWORD_RESET_PARAM, ROUTES, SIGNED_OUT_EVERYWHERE_PARAM } from "@/config/routes";
import { getSignedInUser } from "@/server/data/session";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (await getSignedInUser()) redirect(APP_HOME);
  const params = await searchParams;
  return (
    <>
      {params[PASSWORD_RESET_PARAM] !== undefined && (
        <p role="status" className={successNotice}>
          Your password has been reset. Sign in with your new password.
        </p>
      )}
      {params[SIGNED_OUT_EVERYWHERE_PARAM] !== undefined && (
        <p role="status" className={successNotice}>
          You&apos;re signed out on every device.
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <SignInForm />
      <p className="mt-4 text-sm">
        <Link href={ROUTES.forgotPassword} className={textLink}>
          Forgot your password?
        </Link>
      </p>
      <p className="mt-6 text-sm text-stone-600">
        New here?{" "}
        <Link href={ROUTES.signUp} className={textLink}>
          Create an account
        </Link>
      </p>
    </>
  );
}
