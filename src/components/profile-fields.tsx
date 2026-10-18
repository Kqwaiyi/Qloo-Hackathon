"use client";

import { ManagedByTheTeam } from "@/components/managed-by-the-team";
import { CHOOSE_COUNTRY, CHOOSE_STYLE_PREFERENCE, USERNAME_HINT } from "@/components/messages";
import { fieldError, fieldHint, input, label } from "@/components/ui";
import { STYLE_PREFERENCE_LABELS, STYLE_PREFERENCES, USERNAME_MAX_LENGTH, USERNAME_MIN_LENGTH, USERNAME_PATTERN } from "@/config/accounts";
import { COPY } from "@/config/copy";
import type { CountryOption } from "@/config/countries";

// The profile fields that sign-up and Settings share.

/**
 * The username, with Better Auth's rules as its hint, or "That username is taken" in its place. On
 * the Demo Account it's managed by the team: shown, disabled, with a lock instead.
 */
export function UsernameField({
  value,
  onChange,
  taken,
  invalid,
  managed = false,
}: {
  value: string;
  onChange: (username: string) => void;
  taken: boolean;
  invalid: boolean;
  managed?: boolean;
}) {
  return (
    <div>
      <label htmlFor="username" className={label}>
        Username
      </label>
      <input
        id="username"
        required
        disabled={managed}
        autoComplete="username"
        minLength={USERNAME_MIN_LENGTH}
        maxLength={USERNAME_MAX_LENGTH}
        pattern={USERNAME_PATTERN.source.slice(1, -1)}
        title={USERNAME_HINT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={taken || invalid}
        aria-describedby="username-hint"
        className={input}
      />
      {managed ? (
        <ManagedByTheTeam id="username-hint" className="mt-1" />
      ) : (
        <p id="username-hint" className={taken || invalid ? fieldError : fieldHint}>
          {taken ? COPY.usernameTaken : USERNAME_HINT}
        </p>
      )}
    </div>
  );
}

/** Menswear, Womenswear or No preference, as three radio cards. */
export function StylePreferenceField({ value, onChange, invalid }: { value: string; onChange: (preference: string) => void; invalid: boolean }) {
  return (
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
              checked={value === preference}
              onChange={() => onChange(preference)}
              className="accent-stone-900"
            />
            {STYLE_PREFERENCE_LABELS[preference]}
          </label>
        ))}
      </div>
      {invalid && <p className={fieldError}>{CHOOSE_STYLE_PREFERENCE}</p>}
    </fieldset>
  );
}

/** The Country dropdown, blank until one is chosen. */
export function CountryField({
  countries,
  value,
  onChange,
  invalid,
}: {
  countries: readonly CountryOption[];
  value: string;
  onChange: (code: string) => void;
  invalid: boolean;
}) {
  return (
    <div>
      <label htmlFor="country" className={label}>
        Country
      </label>
      <select id="country" required value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={invalid} className={input}>
        <option value="" disabled />
        {countries.map((country) => (
          <option key={country.code} value={country.code}>
            {country.name}
          </option>
        ))}
      </select>
      {invalid && <p className={fieldError}>{CHOOSE_COUNTRY}</p>}
    </div>
  );
}
