import { and, eq, type SQL } from "drizzle-orm";

import { consultation } from "@/server/db/schema";
import type { OperationContext } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";

/**
 * Who a request comes from, as the operations on one Consultation see them: opening it, its Styling
 * status, Try again, the stuck check that runs with them, and the price refresh. They act for the
 * viewer and never read the session themselves. Today the viewer is always the signed-in user;
 * the Guest, by their guest cookie, is the other kind to come. My Consultations, deleting a
 * Consultation, Settings and the account's operations stay signed-in only, so they read the
 * signed-in user instead.
 */
export interface Viewer {
  /** The user whose Consultations the viewer may open and act on. */
  id: string;
  /** Their Country: prices are shown in its currency, and a new Styling's Products come from its market. */
  countryCode: string;
  /** Whether it's the Demo Account, which holds no user's Styling lock and has no limits. */
  isDemoAccount: boolean;
}

/** The request's viewer, or null for a signed-out visitor. Like `readSignedInUser`, it never renews the session. */
export async function readViewer(ctx: Pick<OperationContext, "auth" | "requestHeaders">): Promise<Viewer | null> {
  const user = await readSignedInUser(ctx);
  return user && { id: user.id, countryCode: user.countryCode, isDemoAccount: user.isDemoAccount };
}

/**
 * Where a query finds the Consultation `consultationId` only if it's the viewer's own. Anyone
 * else's is not found, just like one that doesn't exist.
 */
export function viewersConsultation(viewer: Viewer, consultationId: string): SQL {
  return and(eq(consultation.id, consultationId), eq(consultation.userId, viewer.id))!;
}
