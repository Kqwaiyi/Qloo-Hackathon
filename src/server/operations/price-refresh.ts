import { and, eq, isNotNull } from "drizzle-orm";

import { PRODUCT_CHECKS_AT_ONCE, type ProductSearchMarket } from "@/config/product-search";
import { consultation, outfit, piece } from "@/server/db/schema";
import type { OperationContext, Result } from "@/server/operations/context";
import { readSignedInUser } from "@/server/operations/session";
import { chosenOffer, isDueForCheck } from "@/server/outfit-assembly/products";
import type { ProductCheckResult } from "@/server/product-search/provider";

// The price refresh (spec: "Price refresh"). The Consultation's page shows the stored prices at
// once, then, when one of its Products wasn't checked today, asks for this in the background and
// refreshes in place once it's done.

/** A Consultation that isn't the user's is not found, just like one that doesn't exist. */
export type RefreshPricesRefusal = { refusal: "signed-out" | "not-found" };

/**
 * Checks each Product of one of the signed-in user's own Consultations' current Outfits that wasn't
 * found or checked today, through the product search's free Product check, in the market it was
 * found in, whatever the user's Country is now. The offer rule picks its offer again, with no price
 * filter: its new offer, price and currency are stored with today's date. A Product the check finds
 * no offer of is marked no longer available, and a later check can make it available again. A check
 * that errors changes nothing, so the next visit tries it again. Pieces made before Products have
 * nothing to check.
 */
export async function refreshPrices(
  ctx: Pick<OperationContext, "auth" | "db" | "clock" | "productSearch" | "requestHeaders">,
  consultationId: string,
): Promise<Result<object, RefreshPricesRefusal>> {
  const user = await readSignedInUser(ctx);
  if (!user) return { ok: false, refusal: "signed-out" };
  const [owned] = await ctx.db
    .select({ id: consultation.id })
    .from(consultation)
    .where(and(eq(consultation.id, consultationId), eq(consultation.userId, user.id)));
  if (!owned) return { ok: false, refusal: "not-found" };
  const now = ctx.clock.now();
  const rows = await ctx.db
    .select({ id: piece.id, productId: piece.productId, market: piece.market, officialSite: piece.brandOfficialSite, pricedAt: piece.pricedAt })
    .from(piece)
    .innerJoin(outfit, eq(outfit.id, piece.outfitId))
    .where(and(eq(outfit.consultationId, consultationId), eq(outfit.current, true), isNotNull(piece.productId)));
  // The check constraint keeps a Product Piece's fields all set.
  const due = rows.flatMap(({ id, productId, market, officialSite, pricedAt }) =>
    productId && market && pricedAt && isDueForCheck(pricedAt, now) ? [{ id, productId, market, officialSite }] : [],
  );
  // A few at a time, each taking the next Product due as it finishes.
  await Promise.all(
    Array.from({ length: Math.min(PRODUCT_CHECKS_AT_ONCE, due.length) }, async () => {
      for (let next = due.shift(); next; next = due.shift()) await checkProduct(ctx, next, now);
    }),
  );
  return { ok: true };
}

/** A Product Piece due its check: the Product, the market it was found in, and Qloo's official site for its Brand. */
interface DueProduct {
  /** The Piece's own ID. */
  id: string;
  productId: string;
  market: ProductSearchMarket;
  officialSite: string | null;
}

/** Checks one Product, storing its new offer, or that it's no longer available. An error changes nothing. */
async function checkProduct(ctx: Pick<OperationContext, "db" | "productSearch">, { id, productId, market, officialSite }: DueProduct, now: Date) {
  let result: ProductCheckResult;
  try {
    result = await ctx.productSearch.checkProduct({ productId, market });
  } catch (error) {
    // The next visit checks it again.
    console.error(`Couldn't check Product ${productId}:`, error instanceof Error ? error.message : error);
    return;
  }
  const offer = result.gone ? null : chosenOffer(result.offers, { priceFilter: null, officialSite });
  await ctx.db
    .update(piece)
    .set(
      offer
        ? { offerUrl: offer.url, offerShopDomain: offer.shopDomain, price: offer.price, currency: offer.currency, pricedAt: now, available: true }
        : { pricedAt: now, available: false },
    )
    .where(eq(piece.id, id));
}
