import type { Line } from "@/config/accounts";
import type { AgeGroup } from "@/config/consultations";
import { type Country, findCountry } from "@/config/countries";
import type { QlooAge, QlooGender } from "@/server/qloo/client";

// What the Style Icon and Brand queries both tell Qloo about whom they're for: the age group, the
// Outfit's line and the Country. Pure.

/** Qloo's age bucket for each age group. Qloo's oldest is 55 and older. */
const QLOO_AGES: Record<AgeGroup, QlooAge> = {
  "18_24": "24_and_younger",
  "25_29": "25_to_29",
  "30_34": "30_to_34",
  "35_44": "35_to_44",
  "45_54": "45_to_54",
  "55_64": "55_and_older",
  "65_plus": "55_and_older",
};

const LINE_GENDERS: Record<Line, QlooGender> = { menswear: "male", womenswear: "female" };

export function qlooAge(ageGroup: AgeGroup): QlooAge {
  return QLOO_AGES[ageGroup];
}

/** The gender a line signals, and filters people on. */
export function lineGender(line: Line): QlooGender {
  return LINE_GENDERS[line];
}

/** The Country a Consultation was started in. Throws for a code that isn't on the list. */
export function consultationCountry(countryCode: string): Country {
  const country = findCountry(countryCode);
  if (!country) throw new Error(`No Country has the code ${countryCode}.`);
  return country;
}
