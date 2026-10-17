"use client";

import { useState } from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { RATE_LIMITED } from "@/components/messages";
import { PasswordInput } from "@/components/password-input";
import { fieldError, label, secondaryButton } from "@/components/ui";
import { COPY } from "@/config/copy";

import { deleteAccountAction } from "./actions";

/**
 * "Delete account", which confirms in a modal saying what goes and what providers keep, given the
 * password. Deleted, the user lands on the landing page, signed out.
 */
export function DeleteAccount() {
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<"wrong-password" | "rate-limited" | null>(null);

  async function confirmDeletion(): Promise<boolean> {
    setProblem(null);
    // Deleted, or signed out, the user is redirected.
    const result = await deleteAccountAction({ password });
    if (!result.ok && result.refusal !== "signed-out") setProblem(result.refusal);
    return result.ok;
  }

  return (
    <div>
      <ConfirmDialog
        trigger={COPY.deleteAccount}
        triggerClassName={`${secondaryButton} text-red-700`}
        title="Delete your account?"
        confirmLabel={COPY.deleteAccount}
        confirmingLabel="Deleting…"
        failure="We couldn't delete your account. Try again."
        onConfirm={confirmDeletion}
        fields={
          <>
            <label htmlFor="delete-account-password" className={label}>
              Password
            </label>
            <PasswordInput
              id="delete-account-password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setProblem(null);
              }}
              aria-invalid={problem === "wrong-password"}
              aria-describedby={problem ? "delete-account-problem" : undefined}
            />
            {problem && (
              <p id="delete-account-problem" role="alert" className={fieldError}>
                {problem === "wrong-password" ? "That isn't your password." : RATE_LIMITED}
              </p>
            )}
          </>
        }
      >
        {COPY.accountDeletionWarning}
      </ConfirmDialog>
      <p className="mt-2 text-sm text-stone-600">Deletes your account and everything in it, right away.</p>
    </div>
  );
}
