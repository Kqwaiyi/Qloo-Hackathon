import { AGE_GATE_COOKIE_MAX_AGE_SECONDS, AGE_GATE_COOKIE_NAME } from "@/config/accounts";
import { type CalendarDate, judgeAge } from "@/server/accounts/birth-date";
import { type CookieToSet, type ResponseCookies, readRequestCookie } from "@/server/http/cookies";

/** Set when someone gives an under-18 date of birth; sign-up and the Guest Page stay closed to that browser while it lasts. */
export const AGE_GATE_COOKIE: CookieToSet = {
  name: AGE_GATE_COOKIE_NAME,
  value: "under-18",
  maxAge: AGE_GATE_COOKIE_MAX_AGE_SECONDS,
  path: "/",
  httpOnly: true,
  sameSite: "lax",
};

export function isBlockedByAgeGate(requestHeaders: Headers): boolean {
  return readRequestCookie(requestHeaders, AGE_GATE_COOKIE_NAME) !== undefined;
}

/**
 * Applies the age gate to a date of birth given at `now`, as sign-up's first step and the Guest
 * Page hold it (ADR-0004), returning whether it admits someone 18 or older in every time zone. An
 * under-18 date blocks the browser, through `responseCookies`; one whose 18th birthday has begun
 * somewhere but not everywhere is refused without that, since they may already be 18 where they
 * live. Nothing about the date is stored.
 */
export function applyAgeGate(responseCookies: ResponseCookies, birthDate: CalendarDate, now: Date): boolean {
  const verdict = judgeAge(birthDate, now);
  if (verdict === "under-18") responseCookies.set(AGE_GATE_COOKIE);
  return verdict === "adult";
}
