"use client";

import { type FormEvent, useState, useTransition } from "react";

import { useBotCheck } from "@/components/bot-check";
import { EMAILS_PAUSED, INVALID_EMAIL, RATE_LIMITED } from "@/components/messages";
import { type Notice, NoticeLine } from "@/components/notice";
import { input, label, primaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";
import type { RequestPasswordResetRefusal } from "@/server/operations/password-reset";

import { requestPasswordResetAction } from "./actions";

/** How the last request went: sent (as far as anyone can tell), refused, or not asked yet. */
type Outcome = "sent" | RequestPasswordResetRefusal["refusal"] | null;

/** Asks for a reset link. Every address gets the same answer, so the form stays for a corrected address. */
export function ForgotPasswordForm({
  botCheckSiteKey,
}: {
  /** The Bot Check's site key, or null while the Bot Check is off. */
  botCheckSiteKey: string | null;
}) {
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, startTransition] = useTransition();
  const botCheck = useBotCheck(botCheckSiteKey);
  const notice = outcomeNotice(outcome);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setOutcome(null);
    startTransition(async () => {
      const result = await botCheck.send((botCheckToken) =>
        requestPasswordResetAction({ email: String(form.get("email") ?? ""), botCheckToken }),
      );
      setOutcome(result.ok ? "sent" : result.refusal);
    });
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="email" className={label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          aria-invalid={outcome === "invalid-email"}
          className={input}
        />
      </div>
      <NoticeLine notice={notice} className="text-sm" />
      {botCheck.widget}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {pending ? "Sending…" : "Send link"}
      </button>
    </form>
  );
}

function outcomeNotice(outcome: Outcome): Notice | null {
  switch (outcome) {
    case null:
      return null;
    case "sent":
      return { text: COPY.resetLinkSent, problem: false };
    case "invalid-email":
      return { text: INVALID_EMAIL, problem: true };
    case "bot-check-failed":
      return { text: COPY.botCheckFailed, problem: true };
    case "emails-paused":
      return { text: EMAILS_PAUSED, problem: true };
    case "rate-limited":
      return { text: RATE_LIMITED, problem: true };
  }
}
