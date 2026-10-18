"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useState, useTransition } from "react";

import { BirthDateInputs } from "@/components/birth-date-inputs";
import { useBotCheck } from "@/components/bot-check";
import { INVALID_BIRTH_DATE, INVALID_EMAIL, INVALID_PASSWORD, PASSWORD_HINT } from "@/components/messages";
import { PasswordInput } from "@/components/password-input";
import { CountryField, StylePreferenceField, UsernameField } from "@/components/profile-fields";
import { fieldError, fieldHint, input, label, primaryButton, secondaryButton, textLink } from "@/components/ui";
import { isWellFormedUsername, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/config/accounts";
import { COPY } from "@/config/copy";
import type { CountryOption } from "@/config/countries";
import { ROUTES } from "@/config/routes";
import type { BirthDateFields } from "@/server/accounts/birth-date";
import type { SignUpField, SignUpGateRefusal, SignUpRefusal } from "@/server/operations/sign-up";

import { checkDateOfBirthAction, signUpAction } from "./actions";
import { SignUpClosed } from "./sign-up-closed";

type ClosedReason = SignUpGateRefusal["refusal"];

type Step =
  | { name: "date-of-birth" }
  | { name: "account"; birthDate: BirthDateFields }
  | { name: "closed"; reason: ClosedReason };

export function SignUpFlow({
  countries,
  botCheckSiteKey,
}: {
  countries: readonly CountryOption[];
  /** The Bot Check's site key, or null while the Bot Check is off. */
  botCheckSiteKey: string | null;
}) {
  const [step, setStep] = useState<Step>({ name: "date-of-birth" });
  const close = (reason: ClosedReason) => setStep({ name: "closed", reason });

  if (step.name === "closed") return <SignUpClosed reason={step.reason} />;
  if (step.name === "account") {
    return (
      <AccountStep
        birthDate={step.birthDate}
        countries={countries}
        botCheckSiteKey={botCheckSiteKey}
        onBack={() => setStep({ name: "date-of-birth" })}
        onClosed={close}
      />
    );
  }
  return <DateOfBirthStep onAdult={(birthDate) => setStep({ name: "account", birthDate })} onUnder18={() => close("under-18")} />;
}

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

  return (
    <form onSubmit={submit} className="mt-6">
      <BirthDateInputs
        legend="What's your date of birth?"
        value={fields}
        onChange={(birthDate) => {
          setFields(birthDate);
          setInvalid(false);
        }}
        invalid={invalid}
      />
      {invalid && <p className={fieldError}>{INVALID_BIRTH_DATE}</p>}
      <button type="submit" disabled={pending} className={`${primaryButton} mt-6 w-full`}>
        Continue
      </button>
    </form>
  );
}

/** What the form says beside a field the server found wrong. The shared profile fields say their own. */
const FIELD_MESSAGES: Record<Exclude<SignUpField, "username" | "stylePreference" | "countryCode">, string> = {
  birthDate: "Go back and enter a real date of birth.",
  email: INVALID_EMAIL,
  password: INVALID_PASSWORD,
};

/** A step 2 refusal the form shows beside its fields. */
type AccountRefusal = Exclude<SignUpRefusal, { refusal: ClosedReason }>;

function AccountStep({
  birthDate,
  countries,
  botCheckSiteKey,
  onBack,
  onClosed,
}: {
  birthDate: BirthDateFields;
  countries: readonly CountryOption[];
  botCheckSiteKey: string | null;
  onBack: () => void;
  /** The sign-up hook refused the date of birth or the region, which no field can fix. */
  onClosed: (reason: ClosedReason) => void;
}) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [stylePreference, setStylePreference] = useState("");
  const [countryCode, setCountryCode] = useState(() => countryFromBrowser(countries));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [problem, setProblem] = useState<AccountRefusal | null>(null);
  const [pending, startTransition] = useTransition();
  const botCheck = useBotCheck(botCheckSiteKey);
  const usernameTaken = useUsernameTaken(username) || problem?.refusal === "username-taken";

  function submit(event: FormEvent) {
    event.preventDefault();
    setProblem(null);
    startTransition(async () => {
      // On success the action redirects into the app.
      const result = await botCheck.send((botCheckToken) =>
        signUpAction({ birthDate, username, email, password, stylePreference, countryCode, acceptedTerms, botCheckToken }),
      );
      if (result.ok) return;
      if (result.refusal === "under-18" || result.refusal === "unsupported-region") onClosed(result.refusal);
      else setProblem(result);
    });
  }

  const invalidField = problem?.refusal === "invalid" ? problem.field : null;

  return (
    <form onSubmit={submit} className="mt-6 space-y-5">
      <UsernameField
        value={username}
        onChange={(value) => {
          setUsername(value);
          if (problem?.refusal === "username-taken") setProblem(null);
        }}
        taken={usernameTaken}
        invalid={invalidField === "username"}
      />

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
        <p id="password-hint" className={invalidField === "password" ? fieldError : fieldHint}>
          {PASSWORD_HINT}
        </p>
      </div>

      <StylePreferenceField value={stylePreference} onChange={setStylePreference} invalid={invalidField === "stylePreference"} />

      <CountryField countries={countries} value={countryCode} onChange={setCountryCode} invalid={invalidField === "countryCode"} />

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
      {problem?.refusal === "bot-check-failed" && (
        <p role="alert" className={fieldError}>
          {COPY.botCheckFailed}
        </p>
      )}
      {problem?.refusal === "too-many-sign-ups" && (
        <p role="alert" className={fieldError}>
          Too many accounts were made from your network recently. Please try again later.
        </p>
      )}

      {botCheck.widget}

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
function countryFromBrowser(countries: readonly CountryOption[]): string {
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
