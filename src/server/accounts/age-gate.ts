import { AGE_GATE_COOKIE_MAX_AGE_SECONDS, AGE_GATE_COOKIE_NAME } from "@/config/accounts";
import { type CookieToSet, readRequestCookie } from "@/server/http/cookies";

/** Set when someone gives an under-18 date of birth; sign-up stays closed to that browser while it lasts. */
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
