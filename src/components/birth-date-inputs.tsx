"use client";

import { input, label } from "@/components/ui";
import type { BirthDateFields } from "@/server/accounts/birth-date";

// The date of birth as three fields: sign-up's first step and the Demo Account's Settings share them.

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

/** Day, Month and Year, under this legend. */
export function BirthDateInputs({
  legend,
  value,
  onChange,
  invalid,
}: {
  legend: string;
  value: BirthDateFields;
  onChange: (birthDate: BirthDateFields) => void;
  invalid: boolean;
}) {
  const update = (field: keyof BirthDateFields) => (fieldValue: string) => onChange({ ...value, [field]: fieldValue });

  return (
    <fieldset>
      <legend className="font-medium">{legend}</legend>
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
            value={value.day}
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
            value={value.month}
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
            value={value.year}
            onChange={(event) => update("year")(event.target.value)}
            aria-invalid={invalid}
            className={input}
          />
        </div>
      </div>
    </fieldset>
  );
}
