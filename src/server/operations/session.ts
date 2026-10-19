import type { StylePreference } from "@/config/accounts";
import { forwardSetCookies } from "@/server/http/cookies";
import type { AuthRequestContext, OperationContext } from "@/server/operations/context";

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
  /** When they signed up. */
  createdAt: Date;
  /** The photo notice they last agreed to on the consent sheet, and when, or null if they haven't since signing up or withdrawing. */
  photoConsent: PhotoConsent | null;
  /** Whether this is the Demo Account, the one the judges share, whose sign-in the team manages. */
  isDemoAccount: boolean;
}

export interface PhotoConsent {
  /** The PHOTO_NOTICE_VERSION they agreed to. */
  noticeVersion: number;
  acceptedAt: Date;
}

/**
 * The user signed in on this request, or null. Never renews the session (see `refreshSession`): a
 * page can't set cookies, so a renewal here would roll the session forward in the database while
 * the browser's cookie still expired 30 days after sign-in.
 */
export async function readSignedInUser(ctx: Pick<OperationContext, "auth" | "requestHeaders">): Promise<SignedInUser | null> {
  const session = await ctx.auth.api.getSession({ headers: ctx.requestHeaders, query: { disableRefresh: true } });
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
    createdAt: new Date(user.createdAt),
    photoConsent:
      user.acceptedPhotoNoticeVersion == null || user.photoNoticeAcceptedAt == null
        ? null
        : { noticeVersion: user.acceptedPhotoNoticeVersion, acceptedAt: new Date(user.photoNoticeAcceptedAt) },
    // Better Auth keeps emails lowercased, as config names the Demo Account's.
    isDemoAccount: user.email === ctx.auth.demoAccountEmail,
  };
}

/**
 * Rolls the session forward once it is a day old, and sends its cookie again so the browser keeps
 * it 30 more days; a session that has ended has its cookie cleared. The only place a session
 * renews outside Better Auth's own endpoints, since it passes the cookie on. Runs on every page load
 * that carries a session cookie.
 */
export async function refreshSession(ctx: AuthRequestContext): Promise<void> {
  const { headers } = await ctx.auth.api.getSession({ headers: ctx.requestHeaders, returnHeaders: true });
  forwardSetCookies(headers, ctx.responseCookies);
}
