"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState, useTransition } from "react";

import { INVALID_EMAIL, INVALID_PASSWORD, PASSWORD_HINT } from "@/components/messages";
import { PasswordInput } from "@/components/password-input";
import { fieldError, input, label, primaryButton, secondaryButton, textLink } from "@/components/ui";
import {
  isWellFormedUsername,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  STYLE_PREFERENCE_LABELS,
  STYLE_PREFERENCES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from "@/config/accounts";
import { COPY } from "@/config/copy";
import { ROUTES } from "@/config/routes";
import type { BirthDateFields } from "@/server/accounts/birth-date";
import type { SignUpField, SignUpRefusal } from "@/server/operations/sign-up";

import { checkDateOfBirthAction, signUpAction } from "./actions";
import { AgeGateMessage } from "./age-gate-message";

interface CountryOption {
  code: string;
  name: string;
}

type Step = { name: "date-of-birth" } | { name: "account"; birthDate: BirthDateFields } | { name: "under-18" };

export function SignUpFlow({ countries }: { countries: CountryOption[] }) {
  const [step, setStep] = useState<Step>({ name: "date-of-birth" });

  if (step.name === "under-18") return <AgeGateMessage />;
  if (step.name === "account") {
    return (
      <AccountStep
        birthDate={step.birthDate}
        countries={countries}
        onBack={() => setStep({ name: "date-of-birth" })}
        onUnder18={() => setStep({ name: "under-18" })}
      />
    );
  }
  return (
    <DateOfBirthStep
      onAdult={(birthDate) => setStep({ name: "account", birthDate })}
      onUnder18={() => setStep({ name: "under-18" })}
    />
  );
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function DateOfBirthStep({ onAdult, onUnder18 }: { onAdult: (birthDate: BirthDateFields) => void; onUnder18: () => void }) {
  const [fields, setFields] = useState<BirthDateFields>({ day: "", month: "", year: "" });
  const [invalid, setInvalid] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await checkDateOfBirthAction(fields);
      if (result.ok) onAdult(fields);
      else if (result.refusal === "under-18") onUnder18();
      else setInvalid(true);
    });
  }

  const update = (field: keyof BirthDateFields) => (value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
    setInvalid(false);
  };

  return (
    <form onSubmit={submit} className="mt-6">
      <fieldset>
        <legend className="font-medium">What&apos;s your date of birth?</legend>
        <div className="mt-3 grid grid-cols-[5rem_1fr_6rem] gap-3">
          <div>
            <label htmlFor="birth-day" className={label}>
              Day
            </label>
            <input
              id="birth-day"
              inputMode="numeric"
              autoComplete="bday-day"
              maxLength={2}
              required
              value={fields.day}
              onChange={(event) => update("day")(event.target.value)}
              aria-invalid={invalid}
              className={input}
            />
          </div>
          <div>
            <label htmlFor="birth-month" className={label}>
              Month
            </label>
            <select
              id="birth-month"
              autoComplete="bday-month"
              required
              value={fields.month}
              onChange={(event) => update("month")(event.target.value)}
              aria-invalid={invalid}
              className={input}
            >
              <option value="" disabled />
              {MONTHS.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="birth-year" className={label}>
              Year
            </label>
            <input
              id="birth-year"
              inputMode="numeric"
              autoComplete="bday-year"
              maxLength={4}
              required
              value={fields.year}
              onChange={(event) => update("year")(event.target.value)}
              aria-invalid={invalid}
              className={input}
            />
          </div>
        </div>
      </fieldset>
      {invalid && <p className={fieldError}>Enter a real date of birth.</p>}
      <button type="submit" disabled={pending} className={`${primaryButton} mt-6 w-full`}>
        Continue
      </button>
    </form>
  );
}

const FIELD_MESSAGES: Record<SignUpField, string> = {
  birthDate: "Go back and enter a real date of birth.",
  username: `Use ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} letters, numbers, dots or underscores.`,
  email: INVALID_EMAIL,
  password: INVALID_PASSWORD,
  stylePreference: "Choose a Style Preference.",
  countryCode: "Choose your Country.",
};

/** A step 2 refusal the form shows beside its fields. */
type AccountRefusal = Exclude<SignUpRefusal, { refusal: "under-18" }>;

function AccountStep({
  birthDate,
  countries,
  onBack,
  onUnder18,
}: {
  birthDate: BirthDateFields;
  countries: CountryOption[];
  onBack: () => void;
  onUnder18: () => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stylePreference, setStylePreference] = useState("");
  const [countryCode, setCountryCode] = useState(() => countryFromBrowser(countries));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [problem, setProblem] = useState<AccountRefusal | null>(null);
  const [pending, startTransition] = useTransition();
  const usernameTaken = useUsernameTaken(username) || problem?.refusal === "username-taken";

  function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    startTransition(async () => {
      // On success the action redirects into the app.
      const result = await signUpAction({ birthDate, username, email, password, stylePreference, countryCode, acceptedTerms });
      if (result.ok) return;
      if (result.refusal === "under-18") onUnder18();
      else setProblem(result);
    });
  }

  const invalidField = problem?.refusal === "invalid" ? problem.field : null;

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div>
        <label htmlFor="username" className={label}>
          Username
        </label>
        <input
          id="username"
          required
          autoComplete="username"
          minLength={USERNAME_MIN_LENGTH}
          maxLength={USERNAME_MAX_LENGTH}
          pattern={USERNAME_PATTERN.source.slice(1, -1)}
          title={FIELD_MESSAGES.username}
          value={username}
          onChange={(event) => {
            setUsername(event.target.value);
            if (problem?.refusal === "username-taken") setProblem(null);
          }}
          aria-invalid={usernameTaken || invalidField === "username"}
          aria-describedby="username-hint"
          className={input}
        />
        <p id="username-hint" className={usernameTaken || invalidField === "username" ? fieldError : "mt-1 text-sm text-stone-500"}>
          {usernameTaken ? COPY.usernameTaken : FIELD_MESSAGES.username}
        </p>
      </div>

      <div>
        <label htmlFor="email" className={label}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            if (problem?.refusal === "email-taken") setProblem(null);
          }}
          aria-invalid={problem?.refusal === "email-taken" || invalidField === "email"}
          className={input}
        />
        {problem?.refusal === "email-taken" && (
          <p role="alert" className={fieldError}>
            An account with that email already exists.{" "}
            <Link href={ROUTES.signIn} className={textLink}>
              Sign in
            </Link>{" "}
            or{" "}
            <Link href={ROUTES.forgotPassword} className={textLink}>
              reset your password
            </Link>
            .
          </p>
        )}
        {invalidField === "email" && <p className={fieldError}>{FIELD_MESSAGES.email}</p>}
      </div>

      <div>
        <label htmlFor="password" className={label}>
          Password
        </label>
        <PasswordInput
          id="password"
          required
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          maxLength={PASSWORD_MAX_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          aria-invalid={invalidField === "password"}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className={invalidField === "password" ? fieldError : "mt-1 text-sm text-stone-500"}>
          {PASSWORD_HINT}
        </p>
      </div>

      <fieldset>
        <legend className={label}>Style Preference</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {STYLE_PREFERENCES.map((preference) => (
            <label
              key={preference}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-stone-300 bg-white px-3 py-2 has-[:checked]:border-stone-900 has-[:checked]:ring-1 has-[:checked]:ring-stone-900"
            >
              <input
                type="radio"
                name="stylePreference"
                value={preference}
                required
                checked={stylePreference === preference}
                onChange={() => setStylePreference(preference)}
                className="accent-stone-900"
              />
              {STYLE_PREFERENCE_LABELS[preference]}
            </label>
          ))}
        </div>
        {invalidField === "stylePreference" && <p className={fieldError}>{FIELD_MESSAGES.stylePreference}</p>}
      </fieldset>

      <div>
        <label htmlFor="country" className={label}>
          Country
        </label>
        <select
          id="country"
          required
          value={countryCode}
          onChange={(event) => setCountryCode(event.target.value)}
          aria-invalid={invalidField === "countryCode"}
          className={input}
        >
          <option value="" disabled />
          {countries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </select>
        {invalidField === "countryCode" && <p className={fieldError}>{FIELD_MESSAGES.countryCode}</p>}
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          required
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          className="mt-0.5 accent-stone-900"
        />
        <span>
          I agree to the{" "}
          <Link href={ROUTES.terms} target="_blank" className={textLink}>
            Terms
          </Link>{" "}
          and{" "}
          <Link href={ROUTES.privacy} target="_blank" className={textLink}>
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {problem?.refusal === "terms-not-accepted" && (
        <p className={fieldError}>Agree to the Terms and Privacy Policy to create an account.</p>
      )}
      {invalidField === "birthDate" && <p className={fieldError}>{FIELD_MESSAGES.birthDate}</p>}
      {problem?.refusal === "sign-ups-paused" && (
        <p role="alert" className={fieldError}>
          {COPY.signUpsPaused}
        </p>
      )}
      {problem?.refusal === "too-many-sign-ups" && (
        <p role="alert" className={fieldError}>
          Too many accounts were made from your network recently. Please try again later.
        </p>
      )}

      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onBack} className={secondaryButton}>
          Back
        </button>
        <button type="submit" disabled={pending} className={`${primaryButton} flex-1`}>
          {pending ? "Creating your account…" : "Create account"}
        </button>
      </div>
    </form>
  );
}

/** The Country from the browser's language settings (en-GB → United Kingdom), if it's on the list. */
function countryFromBrowser(countries: CountryOption[]): string {
  const codes = new Set(countries.map((country) => country.code));
  for (const tag of navigator.languages?.length ? navigator.languages : [navigator.language]) {
    try {
      const region = new Intl.Locale(tag).region;
      if (region && codes.has(region)) return region;
    } catch {
      // An unparseable language tag: try the next one.
    }
  }
  return "";
}

/** Asks Better Auth whether the username is taken, a moment after the user stops typing. */
function useUsernameTaken(username: string): boolean {
  const [lastCheck, setLastCheck] = useState<{ username: string; available: boolean } | null>(null);

  useEffect(() => {
    const candidate = username.trim();
    if (!isWellFormedUsername(candidate)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/auth/is-username-available", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: candidate }),
          signal: controller.signal,
        });
        if (!response.ok) return;
        const { available } = (await response.json()) as { available: boolean };
        setLastCheck({ username: candidate, available });
      } catch {
        // Offline or aborted: the server still refuses a taken username on submit.
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [username]);

  return lastCheck !== null && lastCheck.username === username.trim() && !lastCheck.available;
}
