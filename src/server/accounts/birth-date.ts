import * as z from "zod";

import { MINIMUM_AGE } from "@/config/accounts";

/** A day in the calendar, such as a date of birth. Only a birth date's year and month are ever stored. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

/** The date of birth fields as the user typed them. */
export const birthDateFieldsSchema = z.object({ day: z.string(), month: z.string(), year: z.string() });
export type BirthDateFields = z.infer<typeof birthDateFieldsSchema>;

/** Reads the three sign-up fields, or returns null when they don't make a real date. */
export function parseBirthDateFields(fields: BirthDateFields): CalendarDate | null {
  const [day, month, year] = [fields.day, fields.month, fields.year].map((field) => field.trim());
  if (!/^\d{1,2}$/.test(day!) || !/^\d{1,2}$/.test(month!) || !/^\d{4}$/.test(year!)) return null;
  return toBirthDate(Number(year), Number(month), Number(day));
}

function toBirthDate(year: number, month: number, day: number): CalendarDate | null {
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return { year, month, day };
}

/**
 * How the age gate treats a date of birth right now (ADR-0004):
 * - `adult`: 18 or older in every time zone, so admitted.
 * - `turns-18-today`: the 18th birthday has begun somewhere but not everywhere. Refused for now,
 *   but the browser isn't blocked, since the user may already be 18 where they live.
 * - `under-18`: not 18 anywhere yet. Refused, and the browser is blocked for 30 days.
 */
export type AgeVerdict = "adult" | "turns-18-today" | "under-18";

export function judgeAge(birthDate: CalendarDate, now: Date): AgeVerdict {
  const eighteenthBirthday = { ...birthDate, year: birthDate.year + MINIMUM_AGE };
  if (compareDates(calendarDateAt(now, EARLIEST_UTC_OFFSET_HOURS), eighteenthBirthday) >= 0) return "adult";
  if (compareDates(calendarDateAt(now, LATEST_UTC_OFFSET_HOURS), eighteenthBirthday) >= 0) return "turns-18-today";
  return "under-18";
}

// The last and first time zones to reach a new day.
const EARLIEST_UTC_OFFSET_HOURS = -12;
const LATEST_UTC_OFFSET_HOURS = 14;

function calendarDateAt(now: Date, utcOffsetHours: number): CalendarDate {
  const shifted = new Date(now.getTime() + utcOffsetHours * 60 * 60 * 1000);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function compareDates(a: CalendarDate, b: CalendarDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** The stored birth year and month as Settings shows them, such as "March 1999". */
export function birthMonthAndYearText(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "YYYY-MM-DD", the form a date of birth travels in to Better Auth's sign-up endpoint. */
export function formatBirthDate({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseIsoBirthDate(value: unknown): CalendarDate | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return toBirthDate(Number(match[1]), Number(match[2]), Number(match[3]));
}
