import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { pendingEmailChangeText } from "@/components/email-change/messages";
import { secondaryButton, successNotice, textLink } from "@/components/ui";
import { COPY } from "@/config/copy";
import { COUNTRY_OPTIONS } from "@/config/countries";
import { EMAIL_CHANGED_PARAM, ROUTES } from "@/config/routes";
import { birthMonthAndYearText } from "@/server/accounts/birth-date";
import { getPendingEmailChange, requireSignedInUser } from "@/server/data/session";
import { getTeamEmail } from "@/server/data/team";

import { signOutEverywhereAction } from "./actions";
import { DeleteAccount } from "./delete-account";
import { EmailForm } from "./email-form";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { WithdrawPhotoConsent } from "./withdraw-photo-consent";

export const metadata: Metadata = { title: "Settings" };

/** Profile, Sign-in, Privacy and Danger. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireSignedInUser();
  const [teamEmail, pendingEmailChange, params] = await Promise.all([getTeamEmail(), getPendingEmailChange(), searchParams]);
  return (
    <>
      {params[EMAIL_CHANGED_PARAM] !== undefined && (
        <p role="status" className={successNotice}>
          Email changed to {user.email}.
        </p>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <Section title="Profile">
        <ProfileForm
          profile={{ username: user.username, stylePreference: user.stylePreference, countryCode: user.countryCode }}
          countries={COUNTRY_OPTIONS}
        />
        <p className="mt-6 border-t border-stone-200 pt-4 text-sm text-stone-700">
          {COPY.bornIn(birthMonthAndYearText(user.birthYear, user.birthMonth))} · {COPY.birthDateWrong}{" "}
          <a href={mailto(teamEmail, "My date of birth is wrong")} className={textLink}>
            {COPY.emailUs}
          </a>
        </p>
      </Section>

      <Section title="Sign-in">
        <dl>
          <dt className="text-sm font-medium">Email</dt>
          <dd className="mt-1 break-all text-stone-700">{user.email}</dd>
        </dl>
        {pendingEmailChange && (
          <p className="mt-2 break-words rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {pendingEmailChangeText(pendingEmailChange, user.email)}
          </p>
        )}
        <div className="mt-4">
          <EmailForm currentEmail={user.email} verified={user.emailVerified} />
        </div>
        <h3 className="mt-6 border-t border-stone-200 pt-4 font-medium">Password</h3>
        <div className="mt-3">
          <PasswordForm />
        </div>
        <form action={signOutEverywhereAction} className="mt-6 border-t border-stone-200 pt-4">
          <button type="submit" className={secondaryButton}>
            {COPY.signOutEverywhere}
          </button>
          <p className="mt-2 text-sm text-stone-600">Ends every sign-in to your account, this one included.</p>
        </form>
      </Section>

      <Section title="Privacy">
        <WithdrawPhotoConsent />
        <ul className="mt-6 space-y-2 border-t border-stone-200 pt-4">
          <li>
            <Link href={ROUTES.privacy} className={textLink}>
              Privacy Policy
            </Link>
          </li>
          <li>
            <Link href={ROUTES.terms} className={textLink}>
              Terms
            </Link>
          </li>
          <li>
            <a href={mailto(teamEmail, "My data")} className={textLink}>
              {COPY.emailUsForData}
            </a>
            <span className="text-stone-600"> or to correct it. We answer within a month.</span>
          </li>
        </ul>
      </Section>

      <Section title="Danger">
        <DeleteAccount />
      </Section>
    </>
  );
}

/** A link that opens an email to this address with this subject. */
function mailto(address: string, subject: string): string {
  return `mailto:${address}?subject=${encodeURIComponent(subject)}`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = `${title.toLowerCase().replace(/\W+/g, "-")}-heading`;
  return (
    <section aria-labelledby={id} className="mt-8 rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <h2 id={id} className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
