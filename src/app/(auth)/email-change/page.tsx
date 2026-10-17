import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { textLink } from "@/components/ui";
import type { EmailChangeStep } from "@/config/accounts";
import { EMAIL_CHANGE_STEP_PARAM, EMAIL_CHANGED_ROUTE, ROUTES } from "@/config/routes";
import { getSignedInUser } from "@/server/data/session";

import { emailChangeLinkProblem } from "./messages";

export const metadata: Metadata = { title: "Change your email" };

/** The new address's link has changed the email and signed this device in, so it goes on to Settings. */
const FINISHED: EmailChangeStep = "verification";

/**
 * Where Better Auth sends a verified user's email-change links once it has checked them (see
 * EMAIL_CHANGE_LANDINGS). The old address's approval lands here to say the new address has its
 * link. A link that didn't work comes back with an error code. Open to anyone, signed in or not.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const { error } = params;
  if (error === undefined && params[EMAIL_CHANGE_STEP_PARAM] === FINISHED) redirect(EMAIL_CHANGED_ROUTE);
  const signedIn = (await getSignedInUser()) !== null;

  if (error === undefined) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Change approved</h1>
        <p className="mt-4">We&apos;ve sent a link to the new address. Open it there to finish changing your email.</p>
        {signedIn && <BackToSettings />}
      </>
    );
  }

  const problem = emailChangeLinkProblem(String(error));
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{problem.heading}</h1>
      <p className="mt-4">{problem.text}</p>
      {signedIn ? (
        <BackToSettings />
      ) : (
        <p className="mt-6">
          <Link href={ROUTES.signIn} className={textLink}>
            Sign in to change your email
          </Link>
        </p>
      )}
    </>
  );
}

function BackToSettings() {
  return (
    <p className="mt-6">
      <Link href={ROUTES.settings} className={textLink}>
        Go to Settings
      </Link>
    </p>
  );
}
