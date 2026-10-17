import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { textLink } from "@/components/ui";
import { COPY } from "@/config/copy";
import { APP_HOME, EMAIL_VERIFIED_ROUTE, ROUTES } from "@/config/routes";
import { getEmailVerification } from "@/server/data/session";

import { SendNewLink } from "./send-new-link";

export const metadata: Metadata = { title: "Verify your email" };

/**
 * The verification result: where Better Auth sends a verification link once it has checked it. A
 * link that worked, or one opened after the email was verified, goes on into the app. A link that
 * didn't work comes back with Better Auth's error code, whatever its case, and offers a new one.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { error } = await searchParams;
  if (error === undefined) redirect(EMAIL_VERIFIED_ROUTE);
  const verification = await getEmailVerification();
  if (verification?.verified) redirect(APP_HOME);
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">{COPY.badLink}</h1>
      {verification ? (
        <SendNewLink email={verification.email} />
      ) : (
        <p className="mt-6">
          <Link href={ROUTES.signIn} className={textLink}>
            {COPY.signInForNewLink}
          </Link>
        </p>
      )}
    </>
  );
}
