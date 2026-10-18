"use client";

import { type FormEvent, useState, useTransition } from "react";

import { useBotCheck } from "@/components/bot-check";
import { PasswordInput } from "@/components/password-input";
import { input, label, primaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";
import type { SignInRefusal } from "@/server/operations/sign-in";

import { signInAction } from "./actions";

/** What the form says when the server refuses the sign-in. */
const REFUSAL_MESSAGES: Record<SignInRefusal["refusal"], string> = {
  "credentials-mismatch": COPY.signInMismatch,
  "bot-check-failed": COPY.botCheckFailed,
  "too-many-sign-ins": COPY.tooManySignIns,
};

export function SignInForm({
  botCheckSiteKey,
}: {
  /** The Bot Check's site key, or null while the Bot Check is off. */
  botCheckSiteKey: string | null;
}) {
  const [refusal, setRefusal] = useState<SignInRefusal["refusal"] | null>(null);
  const [pending, startTransition] = useTransition();
  const botCheck = useBotCheck(botCheckSiteKey);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setRefusal(null);
    startTransition(async () => {
      const botCheckToken = await botCheck.token();
      // On success the action redirects into the app.
      const result = await signInAction({
        identifier: String(form.get("identifier") ?? ""),
        password: String(form.get("password") ?? ""),
        botCheckToken,
      });
      if (result.ok) return;
      // Even a refusal for another reason has used the token up.
      botCheck.reset();
      setRefusal(result.refusal);
    });
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="identifier" className={label}>
          Username or email
        </label>
        <input id="identifier" name="identifier" required autoComplete="username" className={input} />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          Password
        </label>
        <PasswordInput id="password" name="password" required autoComplete="current-password" />
      </div>
      {refusal && (
        <p role="alert" className="text-sm text-red-700">
          {REFUSAL_MESSAGES[refusal]}
        </p>
      )}
      {botCheck.widget}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
