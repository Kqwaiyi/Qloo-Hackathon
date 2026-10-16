"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useId, useState, useTransition } from "react";

import { changeUnverifiedEmailAction } from "@/components/email-verification/actions";
import { changeEmailProblem } from "@/components/email-verification/messages";
import { NoticeLine } from "@/components/email-verification/notice";
import { useResendLink } from "@/components/email-verification/use-resend-link";
import { input } from "@/components/ui";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";

const bannerButton = "rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium hover:bg-amber-100 disabled:opacity-40";

/**
 * Shown across the app until the user verifies their email: where the link went, what verifying
 * unlocks, and when an unverified account is deleted, with "Resend link" and "Change email".
 */
export function VerifyEmailBanner({ email, deletionDate }: { email: string; deletionDate: string }) {
  const router = useRouter();
  const newEmailId = useId();
  const { resend, resending, notice, setNotice } = useResendLink(email, () => router.refresh());
  const [changing, setChanging] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [saving, startSaving] = useTransition();

  function change(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    startSaving(async () => {
      const result = await changeUnverifiedEmailAction(newEmail);
      if (result.ok) {
        setChanging(false);
        setNewEmail("");
        setNotice({ text: COPY.emailChangeSent, problem: false });
      } else if (result.refusal === "signed-out") router.push(ROUTES.signIn);
      else if (result.refusal === "already-verified") router.refresh();
      else setNotice({ text: changeEmailProblem(result.refusal), problem: true });
    });
  }

  return (
    <section aria-label="Verify your email" className="border-b border-amber-200 bg-amber-50">
      <div className="mx-auto max-w-3xl px-4 py-3 text-sm">
        <p>{COPY.verifyBanner(email, deletionDate)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={resend} disabled={resending} className={bannerButton}>
            {COPY.resendLink}
          </button>
          <button
            type="button"
            onClick={() => {
              setChanging((open) => !open);
              setNotice(null);
            }}
            aria-expanded={changing}
            className={bannerButton}
          >
            {COPY.changeEmail}
          </button>
        </div>
        {changing && (
          <form onSubmit={change} className="mt-3 flex flex-wrap items-end gap-2">
            <div className="min-w-56 flex-1">
              <label htmlFor={newEmailId} className="mb-1 block font-medium">
                New email
              </label>
              <input
                id={newEmailId}
                type="email"
                required
                autoComplete="email"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                className={input}
              />
            </div>
            <button type="submit" disabled={saving} className={bannerButton}>
              Use this email
            </button>
          </form>
        )}
        <NoticeLine notice={notice} className="mt-2" />
      </div>
    </section>
  );
}
