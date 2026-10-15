import { parseCookies, parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";

/** A cookie to send back with the response. */
export interface CookieToSet {
  name: string;
  value: string;
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "lax" | "strict" | "none";
}

/** Where a server operation sets response cookies. Next.js and the tests each provide one. */
export interface ResponseCookies {
  set(cookie: CookieToSet): void;
}

export function readRequestCookie(headers: Headers, name: string): string | undefined {
  return parseCookies(headers.get("cookie") ?? "").get(name);
}

/** Passes every `Set-Cookie` in Better Auth's response headers on to our response. */
export function forwardSetCookies(headers: Headers | undefined, cookies: ResponseCookies): void {
  if (!headers) return;
  for (const header of headers.getSetCookie()) {
    for (const [name, attributes] of parseSetCookieHeader(header)) {
      const options = toCookieOptions(attributes);
      cookies.set({
        name,
        value: attributes.value,
        maxAge: options.maxAge,
        expires: options.expires,
        path: options.path,
        domain: options.domain,
        secure: options.secure,
        httpOnly: options.httpOnly,
        sameSite: parseSameSite(options.sameSite),
      });
    }
  }
}

export function serializeCookie(cookie: CookieToSet): string {
  const parts = [`${cookie.name}=${encodeURIComponent(cookie.value)}`];
  if (cookie.maxAge !== undefined) parts.push(`Max-Age=${cookie.maxAge}`);
  if (cookie.expires) parts.push(`Expires=${cookie.expires.toUTCString()}`);
  if (cookie.path) parts.push(`Path=${cookie.path}`);
  if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
  if (cookie.secure) parts.push("Secure");
  if (cookie.httpOnly) parts.push("HttpOnly");
  if (cookie.sameSite) parts.push(`SameSite=${cookie.sameSite[0]!.toUpperCase()}${cookie.sameSite.slice(1)}`);
  return parts.join("; ");
}

function parseSameSite(value: unknown): CookieToSet["sameSite"] {
  return value === "lax" || value === "strict" || value === "none" ? value : undefined;
}
