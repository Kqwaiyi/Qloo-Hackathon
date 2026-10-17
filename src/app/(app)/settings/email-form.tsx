"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";

import { changeEmailAction } from "@/components/email-change/actions";
import { changeEmailProblem, emailChangeAnswer } from "@/components/email-change/messages";
import { type Notice, NoticeLine } from "@/components/notice";
import { fieldHint, input, label, primaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";

/**
 * A new email address. A verified user's old address approves the change first, then the new one
 * verifies it; an unverified user's changes at once, with a new link.
 */
export function EmailForm({ currentEmail, verified }: { currentEmail: string; verified: boolean }) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [changing, startChanging] = useTransition();

  function change(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    startChanging(async () => {
      const result = await changeEmailAction(newEmail);
      if (result.ok) {
        setNewEmail("");
        setNotice({ text: emailChangeAnswer(result.awaiting, currentEmail), problem: false });
      } else if (result.refusal === "signed-out") router.push(ROUTES.signIn);
      else setNotice({ text: changeEmailProblem(result.refusal), problem: true });
    });
  }

  return (
    <form onSubmit={change} className="space-y-4">
      <div>
        <label htmlFor="new-email" className={label}>
          New email
        </label>
        <input
          id="new-email"
          type="email"
          required
          autoComplete="email"
          value={newEmail}
          onChange={(event) => setNewEmail(event.target.value)}
          aria-describedby="new-email-hint"
          className={input}
        />
        <p id="new-email-hint" className={fieldHint}>
          {verified ? `We'll ask ${currentEmail} to approve the change first.` : "We'll send a new link there."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={changing} className={primaryButton}>
          {changing ? "Changing…" : COPY.changeEmail}
        </button>
        <NoticeLine notice={notice} className="text-sm" />
      </div>
    </form>
  );
}
