"use client";

import { type FormEvent, useState, useTransition } from "react";

import { BirthDateInputs } from "@/components/birth-date-inputs";
import { INVALID_BIRTH_DATE, PROFILE_SAVED } from "@/components/messages";
import { type Notice, NoticeLine } from "@/components/notice";
import { fieldError, primaryButton } from "@/components/ui";
import type { BirthDateFields } from "@/server/accounts/birth-date";
import type { ChangeDemoAccountBirthDateRefusal } from "@/server/operations/account";

import { changeDemoAccountBirthDateAction } from "./actions";

type Problem = Exclude<ChangeDemoAccountBirthDateRefusal["refusal"], "signed-out">;

const PROBLEMS: Record<Problem, string> = {
  "invalid-birth-date": INVALID_BIRTH_DATE,
  "under-18": "The Demo Account must stay 18 or over.",
  // Only the Demo Account sees this form.
  "not-demo-account": "Only the Demo Account's date of birth can be changed here.",
};

/**
 * The Demo Account's date of birth, which judges may change to see how Outfits change, as long as
 * it stays 18 or over. It starts on the month and year held, with the day to fill in.
 */
export function DemoAccountBirthDateForm({ birthYear, birthMonth }: { birthYear: number; birthMonth: number }) {
  const [fields, setFields] = useState<BirthDateFields>({ day: "", month: String(birthMonth), year: String(birthYear) });
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, startSaving] = useTransition();

  function save(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    setNotice(null);
    startSaving(async () => {
      // A signed-out user is redirected to sign in.
      const result = await changeDemoAccountBirthDateAction(fields);
      if (result.ok) setNotice({ text: PROFILE_SAVED, problem: false });
      else if (result.refusal !== "signed-out") setProblem(result.refusal);
    });
  }

  return (
    <form onSubmit={save} className="mt-4 space-y-4">
      <div>
        <BirthDateInputs
          legend="Change the date of birth"
          value={fields}
          onChange={(birthDate) => {
            setFields(birthDate);
            setProblem(null);
          }}
          invalid={problem !== null}
        />
        {problem && (
          <p role="alert" className={fieldError}>
            {PROBLEMS[problem]}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving…" : "Save date of birth"}
        </button>
        <NoticeLine notice={notice} className="text-sm" />
      </div>
    </form>
  );
}
