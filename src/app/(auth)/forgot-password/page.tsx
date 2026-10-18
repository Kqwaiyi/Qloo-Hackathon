import type { Metadata } from "next";
import Link from "next/link";

import { textLink } from "@/components/ui";
import { ROUTES } from "@/config/routes";
import { getBotCheckSiteKey } from "@/server/data/bot-check";

import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

/** Forgot password: open to anyone, signed in or not. */
export default async function Page() {
  const botCheckSiteKey = await getBotCheckSiteKey();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
      <p className="mt-2 text-stone-600">Enter your account&apos;s email and we&apos;ll send you a link to choose a new password.</p>
      <ForgotPasswordForm botCheckSiteKey={botCheckSiteKey} />
      <p className="mt-6 text-sm text-stone-600">
        Remembered it?{" "}
        <Link href={ROUTES.signIn} className={textLink}>
          Sign in
        </Link>
      </p>
    </>
  );
}
