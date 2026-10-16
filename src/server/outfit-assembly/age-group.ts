import { AGE_GROUP_FLOORS, AGE_GROUPS, type AgeGroup } from "@/config/consultations";

/**
 * The age group of someone born in `birthYear`/`birthMonth`, at `now`. Only the birth year and
 * month are stored, so a birthday counts from the first of its month (UTC).
 */
export function ageGroupAt(birthYear: number, birthMonth: number, now: Date): AgeGroup {
  const month = now.getUTCMonth() + 1;
  const age = now.getUTCFullYear() - birthYear - (month < birthMonth ? 1 : 0);
  return AGE_GROUPS.findLast((group) => age >= AGE_GROUP_FLOORS[group]) ?? AGE_GROUPS[0];
}
