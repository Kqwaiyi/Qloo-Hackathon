"use client";

import { useActionState } from "react";

import { EMAILS_PAUSED, INVALID_EMAIL, RATE_LIMITED } from "@/components/messages";
import { type Notice, NoticeLine } from "@/components/notice";
import { input, label, primaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";

import { type ForgotPasswordState, requestPasswordResetAction } from "./actions";

const initialState: ForgotPasswordState = { email: "", outcome: null };

/** Asks for a reset link. Every address gets the same answer, so the form stays for a corrected address. */
export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initialState);
  const notice = outcomeNotice(state.outcome);
  return (
    <form action={formAction} className="mt-6 space-y-4">
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
          defaultValue={state.email}
          key={state.email}
          aria-invalid={notice?.problem === true}
          className={input}
        />
      </div>
      <NoticeLine notice={notice} className="text-sm" />
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {pending ? "Sending…" : "Send link"}
      </button>
    </form>
  );
}

function outcomeNotice(outcome: ForgotPasswordState["outcome"]): Notice | null {
  switch (outcome) {
    case null:
      return null;
    case "sent":
      return { text: COPY.resetLinkSent, problem: false };
    case "invalid-email":
      return { text: INVALID_EMAIL, problem: true };
    case "emails-paused":
      return { text: EMAILS_PAUSED, problem: true };
    case "rate-limited":
      return { text: RATE_LIMITED, problem: true };
  }
}
