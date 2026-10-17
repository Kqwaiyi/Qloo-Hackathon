import { isAPIError } from "better-auth/api";

import { forwardSetCookies } from "@/server/http/cookies";
import type { AuthRequestContext, OperationContext, Result } from "@/server/operations/context";

export interface SignInInput {
  /** A username or an email, in one field. */
  identifier: string;
  password: string;
}

export type SignInRefusal = { refusal: "credentials-mismatch" };

/** Signs in with a username or an email. Every failure looks the same, and nothing locks the account. */
export async function signIn(ctx: OperationContext, input: SignInInput): Promise<Result<object, SignInRefusal>> {
  const identifier = input.identifier.trim();
  try {
    const { headers } = identifier.includes("@")
      ? await ctx.auth.api.signInEmail({
          body: { email: identifier, password: input.password },
          headers: ctx.requestHeaders,
          returnHeaders: true,
        })
      : await ctx.auth.api.signInUsername({
          body: { username: identifier, password: input.password },
          headers: ctx.requestHeaders,
          returnHeaders: true,
        });
    forwardSetCookies(headers, ctx.responseCookies);
    return { ok: true };
  } catch (error) {
    if (isAPIError(error) && error.statusCode < 500) return { ok: false, refusal: "credentials-mismatch" };
    throw error;
  }
}

/** Ends this device's session. */
export async function signOut(ctx: AuthRequestContext): Promise<void> {
  const { headers } = await ctx.auth.api.signOut({ headers: ctx.requestHeaders, returnHeaders: true });
  forwardSetCookies(headers, ctx.responseCookies);
}
