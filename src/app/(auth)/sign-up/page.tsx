import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { textLink } from "@/components/ui";
import { COUNTRIES } from "@/config/countries";
import { APP_HOME, ROUTES } from "@/config/routes";
import { getSignedInUser } from "@/server/data/session";
import { isSignUpBlockedByAgeGate } from "@/server/data/sign-up";

import { AgeGateMessage } from "./age-gate-message";
import { SignUpFlow } from "./sign-up-flow";

export const metadata: Metadata = { title: "Create an account" };

const countryOptions = COUNTRIES.map(({ code, name }) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name, "en"));

export default async function SignUpPage() {
  if (await getSignedInUser()) redirect(APP_HOME);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      {(await isSignUpBlockedByAgeGate()) ? (
        <AgeGateMessage />
      ) : (
        <>
          <SignUpFlow countries={countryOptions} />
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
