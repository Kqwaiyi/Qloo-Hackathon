import * as z from "zod";

import { AUTH_ENDPOINTS } from "@/config/routes";
import { BOT_CHECK_FAILED } from "@/server/auth/bot-check";
import { postToAuthEndpoint } from "@/server/auth/endpoint";
import { forwardSetCookies } from "@/server/http/cookies";
import type { AuthRequestContext, OperationContext, Result } from "@/server/operations/context";

/** Everything the sign-in form sends, unchecked. Its server action parses its input with this. */
export const signInInputSchema = z.object({
  /** A username or an email, in one field. */
  identifier: z.string(),
  password: z.string(),
  /** The Bot Check widget's token. The form has none while the Bot Check is off. */
  botCheckToken: z.string().optional(),
});
export type SignInInput = z.infer<typeof signInInputSchema>;

export type SignInRefusal = { refusal: "credentials-mismatch" | "bot-check-failed" | "too-many-sign-ins" };

/**
 * Signs in with a username or an email, through Better Auth's sign-in endpoint for it, as any client
 * would, so the Bot Check and its per-IP rate limit apply. Every wrong-credentials failure looks the
 * same, and nothing locks the account.
 */
export async function signIn(ctx: OperationContext, input: SignInInput): Promise<Result<object, SignInRefusal>> {
  const identifier = input.identifier.trim();
  const [path, body] = identifier.includes("@")
    ? [AUTH_ENDPOINTS.signInEmail, { email: identifier, password: input.password }]
    : [AUTH_ENDPOINTS.signInUsername, { username: identifier, password: input.password }];
  const answer = await postToAuthEndpoint(ctx, path, body, { botCheckToken: input.botCheckToken });
  if (answer.ok) return { ok: true };
  if (answer.code === BOT_CHECK_FAILED) return { ok: false, refusal: "bot-check-failed" };
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
