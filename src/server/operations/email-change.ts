import * as z from "zod";

import type { EmailChangeStep } from "@/config/accounts";
import { AUTH_ENDPOINTS } from "@/config/routes";
import { findPendingEmailChange, type PendingEmailChange } from "@/server/accounts/email-change";
import { MANAGED_BY_THE_TEAM } from "@/server/auth/demo-account";
import { AUTH_ERROR_CODES } from "@/server/auth/emails";
import { postToAuthEndpoint } from "@/server/auth/endpoint";
import type { AuthRequestContext, OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";

/** Settings → Sign-in: the signed-in user's email change and the link it waits on, if any. */
export async function readPendingEmailChange(
  ctx: Pick<OperationContext, "auth" | "db" | "clock" | "requestHeaders">,
): Promise<PendingEmailChange | null> {
  const user = await readSignedInUser(ctx);
  if (!user) return null;
  return findPendingEmailChange(ctx.db, user.id, ctx.clock.now());
}

export type ChangeEmailRefusal = {
  refusal: "signed-out" | "invalid-email" | "same-email" | "change-limit" | "emails-paused" | "rate-limited" | "managed-by-the-team";
};

/**
 * Changes the signed-in user's email. A verified user's old address approves the change before the
 * new address verifies it, so a sign-in alone can't take the account over: the answer says it now
 * awaits that approval. An unverified user's address changes at once and the new one gets a link,
 * so it awaits verification. An address already in use gets the same answer, with nothing changed
 * or sent.
 */
export async function changeEmail(
  ctx: AuthRequestContext,
  newEmail: string,
): Promise<Result<{ awaiting: EmailChangeStep }, ChangeEmailRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  const email = newEmail.trim();
  if (!z.email().safeParse(email).success) return { ok: false, refusal: "invalid-email" };
  if (email.toLowerCase() === user.email.toLowerCase()) return { ok: false, refusal: "same-email" };

  const answer = await postToAuthEndpoint(ctx, AUTH_ENDPOINTS.changeEmail, { newEmail: email });
  if (answer.ok) return { ok: true, awaiting: user.emailVerified ? "approval" : "verification" };
  switch (answer.code) {
    case AUTH_ERROR_CODES.emailLimitReached:
      return { ok: false, refusal: "change-limit" };
    case AUTH_ERROR_CODES.emailsPaused:
      return { ok: false, refusal: "emails-paused" };
    case MANAGED_BY_THE_TEAM:
      return { ok: false, refusal: "managed-by-the-team" };
  }
  if (answer.status === 401) return { ok: false, refusal: "signed-out" };
  if (answer.status === 429) return { ok: false, refusal: "rate-limited" };
  throw new Error(`Better Auth couldn't change the email (${answer.status} ${answer.code ?? "no code"}).`);
}
