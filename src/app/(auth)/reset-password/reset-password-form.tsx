"use client";

import { useActionState } from "react";

import { INVALID_PASSWORD, PASSWORD_HINT } from "@/components/messages";
import { PasswordInput } from "@/components/password-input";
import { fieldError, label, primaryButton } from "@/components/ui";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/config/accounts";

import { resetPasswordAction, type ResetPasswordState } from "./actions";
import { BadResetLink } from "./bad-reset-link";

const initialState: ResetPasswordState = { refusal: null };

/** The new password, sent with the token the link brought. On success the action redirects to sign-in. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(resetPasswordAction, initialState);
  if (state.refusal === "invalid-link") return <BadResetLink />;
  const invalid = state.refusal === "invalid-password";
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-2 text-stone-600">This signs you out on every device. Then sign in with your new password.</p>
      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label htmlFor="new-password" className={label}>
            New password
          </label>
          <PasswordInput
            id="new-password"
            name="newPassword"
            required
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            aria-invalid={invalid}
            aria-describedby="new-password-hint"
          />
          <p id="new-password-hint" className={invalid ? fieldError : "mt-1 text-sm text-stone-500"}>
            {invalid ? INVALID_PASSWORD : PASSWORD_HINT}
          </p>
        </div>
        <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
          {pending ? "Saving…" : "Reset password"}
        </button>
      </form>
    </>
  );
}
