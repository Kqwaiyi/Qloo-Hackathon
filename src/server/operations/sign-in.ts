import { AUTH_ENDPOINTS } from "@/config/routes";
import { postToAuthEndpoint } from "@/server/auth/endpoint";
import { forwardSetCookies } from "@/server/http/cookies";
import type { AuthRequestContext, OperationContext, Result } from "@/server/operations/context";

export interface SignInInput {
  /** A username or an email, in one field. */
  identifier: string;
  password: string;
}

export type SignInRefusal = { refusal: "credentials-mismatch" | "too-many-sign-ins" };

/**
 * Signs in with a username or an email, through Better Auth's sign-in endpoint for it, as any client
 * would, so its per-IP rate limit applies. Every wrong-credentials failure looks the same, and
 * nothing locks the account.
 */
export async function signIn(ctx: OperationContext, input: SignInInput): Promise<Result<object, SignInRefusal>> {
  const identifier = input.identifier.trim();
  const answer = identifier.includes("@")
    ? await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.signInEmail, { email: identifier, password: input.password })
    : await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.signInUsername, { username: identifier, password: input.password });
  if (answer.ok) return { ok: true };
  // Better Auth's per-IP rate limit, which answers without a code.
  if (answer.status === 429) return { ok: false, refusal: "too-many-sign-ins" };
  if (answer.status < 500) return { ok: false, refusal: "credentials-mismatch" };
  throw new Error(`Better Auth refused the sign-in (${answer.status} ${answer.code ?? "no code"}).`);
}

/** Ends this device's session. */
export async function signOut(ctx: AuthRequestContext): Promise<void> {
  const { headers } = await ctx.auth.api.signOut({ headers: ctx.requestHeaders, returnHeaders: true });
  forwardSetCookies(headers, ctx.responseCookies);
}
