import { and, eq, type SQL } from "drizzle-orm";

import { consultation, user } from "@/server/db/schema";
import { readGuestCookie } from "@/server/guests/guest-cookie";
import type { OperationContext } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";

/**
 * Who a request comes from, as the operations on one Consultation see them: opening it, its Styling
 * status, Try again, the stuck check that runs with them, and the price refresh. They act for the
 * viewer and never read the session themselves. The viewer is the signed-in user, or else a Guest,
 * by their guest cookie, whose only Consultation is their Guest Consultation. My Consultations,
 * deleting a Consultation, Settings and the account's operations stay signed-in only, so they
 * read the signed-in user instead.
 */
export interface Viewer {
  /** The user whose Consultations the viewer may open and act on: a Guest's guest user. */
  id: string;
  /** Their Country: prices are shown in its currency, and a new Styling's Products come from its market. */
  countryCode: string;
  /** Whether it's the Demo Account, which holds no user's Styling lock and has no limits. */
  isDemoAccount: boolean;
  /** Whether it's a Guest, whose Guest Consultation is one Styling's Outfits and no more. */
  isGuest: boolean;
}

/**
 * The request's viewer, or null for a visitor who is neither signed in nor holds a guest cookie
 * that works. Like `readSignedInUser`, it never renews the session.
 */
export async function readViewer(ctx: Pick<OperationContext, "auth" | "db" | "clock" | "requestHeaders">): Promise<Viewer | null> {
  const signedIn = await readSignedInUser(ctx);
  if (signedIn) return { id: signedIn.id, countryCode: signedIn.countryCode, isDemoAccount: signedIn.isDemoAccount, isGuest: false };
  return readGuest(ctx);
}

/** The Guest whose guest cookie the request holds, or null without one that works, or once their guest user is gone. */
export async function readGuest(ctx: Pick<OperationContext, "auth" | "db" | "clock" | "requestHeaders">): Promise<Viewer | null> {
  const guestUserId = readGuestCookie(ctx.auth.cookieSecret, ctx.requestHeaders, ctx.clock.now());
  if (!guestUserId) return null;
  const [guest] = await ctx.db
    .select({ id: user.id, countryCode: user.countryCode })
    .from(user)
    .where(and(eq(user.id, guestUserId), eq(user.isGuest, true)));
  return guest ? { ...guest, isDemoAccount: false, isGuest: true } : null;
}

/**
 * Where a query finds the Consultation `consultationId` only if it's the viewer's own. Anyone
 * else's is not found, just like one that doesn't exist.
 */
export function viewersConsultation(viewer: Viewer, consultationId: string): SQL {
  return and(eq(consultation.id, consultationId), eq(consultation.userId, viewer.id))!;
}
