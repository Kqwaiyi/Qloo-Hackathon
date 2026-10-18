import type { OperationContext, Refusal } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { checkStylingStart, type StylingStart } from "@/server/stylings/start";
import { readUsageLeft } from "@/server/usage/records";

/**
 * What the UI shows of the user's limits: the allowance line beside every action that uses Outfits,
 * and, when no Styling can start, why, on the Photo Type step and the results actions that start
 * Stylings.
 */
export interface UsageSummary {
  /**
   * The Outfits left in the user's Outfit Allowance: "Uses <n> of your <left> Outfits left today".
   * Null on the Demo Account, which has no Outfit Allowance, so no allowance line.
   */
  outfitsLeft: number | null;
  /** When more Outfits become available, or null while none count against the allowance, or there's none. */
  moreOutfitsFrom: Date | null;
  /**
   * Whether a Styling can start now, and how many Outfits it would make, or why it can't, such as
   * an app-wide cap or the Qloo backstop. Only a verified user can start one.
   */
  stylingStart: StylingStart | Refusal<{ refusal: "unverified" }>;
}

/** The signed-in user's usage summary, or null for a signed-out visitor. */
export async function readUsageSummary(
  ctx: Pick<OperationContext, "auth" | "db" | "clock" | "stylings" | "requestHeaders">,
): Promise<UsageSummary | null> {
  const user = await readSignedInUser(ctx);
  if (!user) return null;
  // First, so the Outfits of any stuck Styling it finishes count in what's left.
  const stylingStart: UsageSummary["stylingStart"] = user.emailVerified
    ? await checkStylingStart(ctx, user)
    : { ok: false, refusal: "unverified" };
  if (user.isDemoAccount) return { outfitsLeft: null, moreOutfitsFrom: null, stylingStart };
  const outfits = await readUsageLeft(ctx.db, { kind: "outfit", userId: user.id, at: ctx.clock.now() });
  return { outfitsLeft: outfits.left, moreOutfitsFrom: outfits.moreFrom, stylingStart };
}
