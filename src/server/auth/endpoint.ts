import { forwardSetCookies } from "@/server/http/cookies";
import type { AuthRequestContext } from "@/server/operations/context";

import { BOT_CHECK_TOKEN_HEADER } from "./bot-check";

/** What one of Better Auth's endpoints answered. */
export type AuthEndpointResult =
  | { ok: true }
  /** Its error code upper-cased, since the case differs between Better Auth's docs and its code. */
  | { ok: false; status: number; code: string | undefined };

/**
 * Posts to one of Better Auth's own HTTP endpoints on behalf of the request a server action is
 * handling, as the browser itself would. Unlike an `auth.api` call, this goes through Better Auth's
 * rate limits and the Bot Check, and the email an endpoint sends knows which endpoint asked for it.
 * Cookies in the answer go back to the browser. A Bot Check token from the form replaces any the
 * browser sent itself.
 */
export async function postToAuthEndpoint(
  ctx: AuthRequestContext,
  path: string,
  body: unknown,
  { botCheckToken }: { botCheckToken?: string } = {},
): Promise<AuthEndpointResult> {
  const { baseURL } = await ctx.auth.$context;
  // The browser's own headers (its cookies, origin and IP address), carrying JSON instead of the form.
  const headers = new Headers(ctx.requestHeaders);
  headers.delete("content-length");
  headers.set("content-type", "application/json");
  if (botCheckToken !== undefined) headers.set(BOT_CHECK_TOKEN_HEADER, botCheckToken);
  const response = await ctx.auth.handler(new Request(`${baseURL}${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
  forwardSetCookies(response.headers, ctx.responseCookies);
  if (response.ok) return { ok: true };
  const answer: unknown = await response.json().catch(() => undefined);
  const code = (answer as { code?: unknown } | undefined)?.code;
  return { ok: false, status: response.status, code: typeof code === "string" ? code.toUpperCase() : undefined };
}
