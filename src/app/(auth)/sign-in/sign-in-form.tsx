"use client";

import { useActionState } from "react";

import { PasswordInput } from "@/components/password-input";
import { input, label, primaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";

import { signInAction, type SignInState } from "./actions";

const initialState: SignInState = { identifier: "", failed: false };

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="identifier" className={label}>
          Username or email
        </label>
        <input
          id="identifier"
          name="identifier"
          required
          autoComplete="username"
          defaultValue={state.identifier}
          key={state.identifier}
          className={input}
        />
      </div>
      <div>
        <label htmlFor="password" className={label}>
          Password
        </label>
        <PasswordInput id="password" name="password" required autoComplete="current-password" />
      </div>
      {state.failed && (
        <p role="alert" className="text-sm text-red-700">
          {COPY.signInMismatch}
        </p>
      )}
      <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
