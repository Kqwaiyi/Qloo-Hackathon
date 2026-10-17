"use client";

import { type FormEvent, useState, useTransition } from "react";

import { type Notice, NoticeLine } from "@/components/notice";
import { CountryField, StylePreferenceField, UsernameField } from "@/components/profile-fields";
import { primaryButton } from "@/components/ui";
import type { CountryOption } from "@/config/countries";
import type { UpdateProfileRefusal } from "@/server/operations/account";
import type { SignedInUser } from "@/server/operations/session";

import { updateProfileAction } from "./actions";

/** A refusal the form shows beside its fields. A signed-out user is sent to sign in instead. */
type ProfileProblem = Exclude<UpdateProfileRefusal, { refusal: "signed-out" }>;

const SAVED: Notice = { text: "Saved. Your next Consultations use it; earlier ones keep the profile they were made with.", problem: false };

/** The username, Style Preference and Country, saved together. */
export function ProfileForm({
  profile,
  countries,
}: {
  profile: Pick<SignedInUser, "username" | "stylePreference" | "countryCode">;
  countries: readonly CountryOption[];
}) {
  const [username, setUsername] = useState(profile.username);
  const [stylePreference, setStylePreference] = useState<string>(profile.stylePreference);
  const [countryCode, setCountryCode] = useState(profile.countryCode);
  const [problem, setProblem] = useState<ProfileProblem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [saving, startSaving] = useTransition();

  function save(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    setNotice(null);
    startSaving(async () => {
      // A signed-out user is redirected to sign in.
      const result = await updateProfileAction({ username, stylePreference, countryCode });
      if (result.ok) setNotice(SAVED);
      else if (result.refusal !== "signed-out") setProblem(result);
    });
  }

  const invalidField = problem?.refusal === "invalid" ? problem.field : null;

  return (
    <form onSubmit={save} className="space-y-5">
      <UsernameField
        value={username}
        onChange={(value) => {
          setUsername(value);
          if (problem?.refusal === "username-taken") setProblem(null);
        }}
        taken={problem?.refusal === "username-taken"}
        invalid={invalidField === "username"}
      />
      <StylePreferenceField value={stylePreference} onChange={setStylePreference} invalid={invalidField === "stylePreference"} />
      <CountryField countries={countries} value={countryCode} onChange={setCountryCode} invalid={invalidField === "countryCode"} />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? "Saving…" : "Save profile"}
        </button>
        <NoticeLine notice={notice} className="text-sm" />
      </div>
    </form>
  );
}
