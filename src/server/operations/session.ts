import type { StylePreference } from "@/config/accounts";
import { forwardSetCookies } from "@/server/http/cookies";
import type { OperationContext } from "@/server/operations/context";

export interface SignedInUser {
  id: string;
  /** As the user typed it. */
  username: string;
  email: string;
  emailVerified: boolean;
  stylePreference: StylePreference;
  countryCode: string;
  birthYear: number;
  birthMonth: number;
}

/** The user signed in on this request, or null. */
export async function readSignedInUser(ctx: Pick<OperationContext, "auth" | "requestHeaders">): Promise<SignedInUser | null> {
  const session = await ctx.auth.api.getSession({ headers: ctx.requestHeaders });
  if (!session) return null;
  const { user } = session;
  return {
    id: user.id,
    username: user.displayUsername ?? user.username ?? user.name,
    email: user.email,
    emailVerified: user.emailVerified,
    stylePreference: user.stylePreference as StylePreference,
    countryCode: user.countryCode,
    birthYear: user.birthYear!,
    birthMonth: user.birthMonth!,
  };
}

/**
 * Rolls the session forward once it is a day old, and sends its cookie again so the browser keeps
 * it 30 more days. Runs on every page request that carries a session cookie.
 */
export async function refreshSession(ctx: Pick<OperationContext, "auth" | "requestHeaders" | "responseCookies">): Promise<void> {
  const { headers } = await ctx.auth.api.getSession({ headers: ctx.requestHeaders, returnHeaders: true });
  forwardSetCookies(headers, ctx.responseCookies);
}
