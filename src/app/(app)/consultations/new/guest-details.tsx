"use client";

import { BirthDateInputs } from "@/components/birth-date-inputs";
import { input, label } from "@/components/ui";
import { STYLE_PREFERENCE_LABELS, STYLE_PREFERENCES } from "@/config/accounts";
import { COPY } from "@/config/copy";
import type { CountryOption } from "@/config/countries";
import type { BirthDateFields } from "@/server/accounts/birth-date";
import type { GuestDetailsField } from "@/server/operations/guest-consultations";

/** What a Guest gives on the photo step, since they have no profile to take it from. */
export interface GuestDetailsValue {
  birthDate: BirthDateFields;
  stylePreference: string;
  countryCode: string;
}

/** What the Guest Page's New Consultation starts from: the Country list, and the Country filled in from the IP address's, or "" for none. */
export interface GuestVariant {
  countries: readonly CountryOption[];
  countryCode: string;
}

/** The details left blank, in the order the fields are, which "Get my Outfits" names. */
export function missingGuestDetails({ birthDate, stylePreference, countryCode }: GuestDetailsValue): GuestDetailsField[] {
  const missing: GuestDetailsField[] = [];
  if (!birthDate.day.trim() || !birthDate.month || !birthDate.year.trim()) missing.push("birthDate");
  if (!stylePreference) missing.push("stylePreference");
  if (!countryCode) missing.push("countryCode");
  return missing;
}

/**
 * The Guest's details beside "Get my Outfits": the date of birth, as sign-up's fields take it (no
 * default, and no hint of the age limit), then the Style Preference and Country, each blank until
 * chosen unless the Country came from the IP address. `invalid` marks the ones "Get my Outfits"
 * found missing or wrong; the line under it says which.
 */
export function GuestDetails({
  value,
  onChange,
  countries,
  invalid,
  disabled,
}: {
  value: GuestDetailsValue;
  onChange: (value: GuestDetailsValue) => void;
  countries: readonly CountryOption[];
  invalid: readonly GuestDetailsField[];
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3 text-sm">
      <BirthDateInputs
        legend={COPY.guestBirthDate}
        value={value.birthDate}
        onChange={(birthDate) => onChange({ ...value, birthDate })}
        invalid={invalid.includes("birthDate")}
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor="guest-style-preference" className={label}>
            {COPY.guestDetailNames.stylePreference}
          </label>
          <select
            id="guest-style-preference"
            value={value.stylePreference}
            onChange={(event) => onChange({ ...value, stylePreference: event.target.value })}
            aria-invalid={invalid.includes("stylePreference")}
            className={input}
          >
            <option value="" disabled />
            {STYLE_PREFERENCES.map((preference) => (
              <option key={preference} value={preference}>
                {STYLE_PREFERENCE_LABELS[preference]}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0">
          <label htmlFor="guest-country" className={label}>
            {COPY.guestDetailNames.countryCode}
          </label>
          <select
            id="guest-country"
            autoComplete="country"
            value={value.countryCode}
            onChange={(event) => onChange({ ...value, countryCode: event.target.value })}
            aria-invalid={invalid.includes("countryCode")}
            className={input}
          >
            <option value="" disabled />
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </fieldset>
  );
}
