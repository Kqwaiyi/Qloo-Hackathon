import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { textLink } from "@/components/ui";
import { APP_HOME, ROUTES } from "@/config/routes";
import { getSignedInUser } from "@/server/data/session";

import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getSignedInUser()) redirect(APP_HOME);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <SignInForm />
      <p className="mt-6 text-sm text-stone-600">
        New here?{" "}
        <Link href={ROUTES.signUp} className={textLink}>
          Create an account
        </Link>
      </p>
    </>
  );
}
