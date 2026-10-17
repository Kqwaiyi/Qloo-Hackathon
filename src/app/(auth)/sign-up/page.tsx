import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { textLink } from "@/components/ui";
import { COUNTRY_OPTIONS } from "@/config/countries";
import { APP_HOME, ROUTES } from "@/config/routes";
import { getSignedInUser } from "@/server/data/session";
import { isSignUpBlockedByAgeGate } from "@/server/data/sign-up";

import { AgeGateMessage } from "./age-gate-message";
import { SignUpFlow } from "./sign-up-flow";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  if (await getSignedInUser()) redirect(APP_HOME);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      {(await isSignUpBlockedByAgeGate()) ? (
        <AgeGateMessage />
      ) : (
        <>
          <SignUpFlow countries={COUNTRY_OPTIONS} />
          <p className="mt-6 text-sm text-stone-600">
            Already have an account?{" "}
            <Link href={ROUTES.signIn} className={textLink}>
              Sign in
            </Link>
          </p>
        </>
      )}
    </>
  );
}
