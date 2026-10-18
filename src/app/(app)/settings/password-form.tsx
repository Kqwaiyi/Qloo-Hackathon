"use client";

import { type FormEvent, useState, useTransition } from "react";

import { INVALID_PASSWORD, PASSWORD_HINT, RATE_LIMITED } from "@/components/messages";
import { type Notice, NoticeLine } from "@/components/notice";
import { PasswordInput } from "@/components/password-input";
import { fieldError, fieldHint, label, primaryButton } from "@/components/ui";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/config/accounts";
import { COPY } from "@/config/copy";

import { changePasswordAction } from "./actions";

const CHANGED: Notice = { text: "Password changed. Your other devices are signed out.", problem: false };

/** A new password, given the current one. */
export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [problem, setProblem] = useState<"wrong-password" | "invalid-password" | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [changing, startChanging] = useTransition();

  function change(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    setNotice(null);
    startChanging(async () => {
      // A signed-out user is redirected to sign in.
      const result = await changePasswordAction({ currentPassword, newPassword });
      if (result.ok) {
        setCurrentPassword("");
        setNewPassword("");
        setNotice(CHANGED);
      } else if (result.refusal === "rate-limited") setNotice({ text: RATE_LIMITED, problem: true });
      else if (result.refusal === "managed-by-the-team") setNotice({ text: COPY.managedByTheTeam, problem: true });
      else if (result.refusal !== "signed-out") setProblem(result.refusal);
    });
  }

  return (
    <form onSubmit={change} className="space-y-4">
      <div>
        <label htmlFor="current-password" className={label}>
          Current password
        </label>
        <PasswordInput
          id="current-password"
          required
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
            if (problem === "wrong-password") setProblem(null);
          }}
          aria-invalid={problem === "wrong-password"}
          aria-describedby={problem === "wrong-password" ? "current-password-problem" : undefined}
        />
        {problem === "wrong-password" && (
          <p id="current-password-problem" className={fieldError}>
            That isn&apos;t your current password.
          </p>
        )}
      </div>
      <div>
        <label htmlFor="new-password" className={label}>
          New password
        </label>
        <PasswordInput
          id="new-password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          aria-invalid={problem === "invalid-password"}
          aria-describedby="new-password-hint"
        />
        <p id="new-password-hint" className={problem === "invalid-password" ? fieldError : fieldHint}>
          {problem === "invalid-password" ? INVALID_PASSWORD : `${PASSWORD_HINT} Changing it signs you out on your other devices.`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={changing} className={primaryButton}>
          {changing ? "Changing…" : "Change password"}
        </button>
        <NoticeLine notice={notice} className="text-sm" />
      </div>
    </form>
  );
}
