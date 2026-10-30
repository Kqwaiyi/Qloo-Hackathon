import { createHmac, timingSafeEqual } from "node:crypto";

import { GUEST_COOKIE_MAX_AGE_SECONDS, GUEST_COOKIE_NAME, GUEST_COOKIE_VALID_SECONDS } from "@/config/guests";
import { type CookieToSet, readRequestCookie } from "@/server/http/cookies";

// The guest cookie: how the Guest Page knows a Guest, holding their guest user's id. It's signed,
// so nobody can make one for someone else's guest user, and it carries when it stops working, so
// it's refused after its hour even though the browser keeps it longer.

/** The guest cookie for this guest user, made at `now`. */
export function guestCookie(secret: string, guestUserId: string, now: Date): CookieToSet {
  const expiresAt = now.getTime() + GUEST_COOKIE_VALID_SECONDS * 1000;
  const payload = `${guestUserId}.${expiresAt}`;
  return { ...GUEST_COOKIE_ATTRIBUTES, value: `${payload}.${signature(secret, payload)}`, maxAge: GUEST_COOKIE_MAX_AGE_SECONDS };
}

/** What clears the guest cookie from the browser. */
export function clearedGuestCookie(): CookieToSet {
  return { ...GUEST_COOKIE_ATTRIBUTES, value: "", maxAge: 0 };
}

/** The guest user the request's guest cookie holds, or null with none, one we didn't sign, or one past its hour at `now`. */
export function readGuestCookie(secret: string, requestHeaders: Headers, now: Date): string | null {
  const signed = signedGuestCookie(secret, requestHeaders);
  return signed && signed.expiresAt > now.getTime() ? signed.guestUserId : null;
}

/** Whether the request holds a guest cookie we signed, within its hour or past it. */
export function holdsSignedGuestCookie(secret: string, requestHeaders: Headers): boolean {
  return signedGuestCookie(secret, requestHeaders) !== null;
}

const GUEST_COOKIE_ATTRIBUTES = { name: GUEST_COOKIE_NAME, path: "/", httpOnly: true, sameSite: "lax" } as const;

/** What the request's guest cookie holds, or null with none, or one we didn't sign. */
function signedGuestCookie(secret: string, requestHeaders: Headers): { guestUserId: string; expiresAt: number } | null {
  const value = readRequestCookie(requestHeaders, GUEST_COOKIE_NAME);
  const match = value && /^([^.]+)\.(\d+)\.([\w-]+)$/.exec(value);
  if (!match) return null;
  const [, guestUserId, expiresAt, signed] = match;
  const expected = Buffer.from(signature(secret, `${guestUserId}.${expiresAt}`));
  const given = Buffer.from(signed!);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { guestUserId: guestUserId!, expiresAt: Number(expiresAt) };
}

function signature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(`guest-cookie:${payload}`).digest("base64url");
}
