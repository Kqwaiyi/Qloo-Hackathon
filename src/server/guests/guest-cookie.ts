import { createHmac, timingSafeEqual } from "node:crypto";

import { GUEST_COOKIE_MAX_AGE_SECONDS, GUEST_COOKIE_NAME } from "@/config/guests";
import { type CookieToSet, readRequestCookie } from "@/server/http/cookies";

// The guest cookie: how the Guest Page knows a Guest, holding their guest user's id. It's signed,
// so nobody can make one for someone else's guest user, and it carries when it stops working, so
// it's refused after its hour even if a browser keeps it.

/** The guest cookie for this guest user, made at `now`. */
export function guestCookie(secret: string, guestUserId: string, now: Date): CookieToSet {
  const expiresAt = now.getTime() + GUEST_COOKIE_MAX_AGE_SECONDS * 1000;
  const payload = `${guestUserId}.${expiresAt}`;
  return {
    name: GUEST_COOKIE_NAME,
    value: `${payload}.${signature(secret, payload)}`,
    maxAge: GUEST_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  };
}

/** The guest user the request's guest cookie holds, or null with none, one we didn't sign, or one past its hour at `now`. */
export function readGuestCookie(secret: string, requestHeaders: Headers, now: Date): string | null {
  const value = readRequestCookie(requestHeaders, GUEST_COOKIE_NAME);
  const match = value && /^([^.]+)\.(\d+)\.([\w-]+)$/.exec(value);
  if (!match) return null;
  const [, guestUserId, expiresAt, signed] = match;
  const expected = Buffer.from(signature(secret, `${guestUserId}.${expiresAt}`));
  const given = Buffer.from(signed!);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(expiresAt) > now.getTime() ? guestUserId! : null;
}

function signature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(`guest-cookie:${payload}`).digest("base64url");
}
